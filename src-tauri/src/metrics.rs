use std::cmp::Ordering;
use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use sysinfo::{DiskKind, Disks, Networks, Pid, ProcessStatus, ProcessesToUpdate, System};
use tauri::{AppHandle, Emitter};

use crate::gpu::{self, GpuInfo};
use crate::model::{
    BatteryInfo, CpuInfo, DiskInfo, HistoryPoint, MemoryInfo, NetInfo, ProcessRow, Snapshot,
};
use crate::settings::Settings;
use crate::tray;

/// 600 точек по умолчанию — это десять минут истории при шаге в секунду.
const HISTORY_CAPACITY: usize = 600;
const DISK_REFRESH: Duration = Duration::from_secs(10);
const TOP_PROCESSES: usize = 8;

pub struct Engine {
    system: System,
    disks: Disks,
    disk_tick: Instant,
    prev_disk: HashMap<String, (u64, u64)>,
    disk_rates: HashMap<String, (u64, u64)>,
    networks: Networks,
    prev_net: HashMap<String, (u64, u64)>,
    net_tick: Instant,
    tick: u64,
    gpu: Option<GpuInfo>,
    hostname: String,
    os_name: String,
    os_version: String,
    kernel: String,
    pub latest: Option<Snapshot>,
    pub rows: Vec<ProcessRow>,
    pub history: VecDeque<HistoryPoint>,
}

impl Engine {
    pub fn new() -> Self {
        let mut system = System::new_all();
        // Первый отсчёт CPU не с чем сравнивать — ждём минимальный интервал
        // и снимаем второй, иначе стартовое значение всегда 0%.
        thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
        system.refresh_cpu_usage();
        system.refresh_processes(ProcessesToUpdate::All, true);

        // Геоданные и версия ОС не меняются — читаем один раз при старте.
        // В sysinfo это статические методы, а не методы экземпляра System.
        let hostname = System::host_name().unwrap_or_else(|| "Windows".to_string());
        let os_name = System::name().unwrap_or_else(|| "Windows".to_string());
        let os_version = System::os_version().unwrap_or_default();
        let kernel = System::kernel_version().unwrap_or_default();

        let mut engine = Self {
            system,
            disks: Disks::new_with_refreshed_list(),
            disk_tick: Instant::now(),
            prev_disk: HashMap::new(),
            disk_rates: HashMap::new(),
            networks: Networks::new_with_refreshed_list(),
            prev_net: HashMap::new(),
            net_tick: Instant::now(),
            tick: 0,
            gpu: None,
            hostname,
            os_name,
            os_version,
            kernel,
            latest: None,
            rows: Vec::new(),
            history: VecDeque::with_capacity(HISTORY_CAPACITY),
        };
        engine.latest = Some(engine.tick());
        engine
    }

    pub fn tick(&mut self) -> Snapshot {
        self.tick = self.tick.wrapping_add(1);

        self.system.refresh_cpu_usage();
        self.system.refresh_memory();
        // Список процессов перечисляем раз в две секунды: обход ~200 процессов
        // дороже всего остального замера, а проценты за 2 с не теряют смысла.
        // На пропущенных тиках используем кэш прошлого замера.
        let refresh_processes = self.tick % 2 == 1;

        // NVML опрашиваем раз в две секунды: утилизация GPU и так считается
        // по интервалу, а лишний вызов драйвера ни к чему.
        if refresh_processes {
            self.gpu = gpu::sample();
        }

        let now = Instant::now();
        let elapsed = now.duration_since(self.net_tick).as_secs_f64().max(0.05);
        self.net_tick = now;

        // Список адаптеров переиспользуем: recreate каждый тик — лишние
        // аллокации и обход интерфейсов.
        self.networks.refresh(true);
        let networks = &self.networks;
        let mut net_rows: Vec<NetInfo> = Vec::with_capacity(networks.len());
        let mut next_prev: HashMap<String, (u64, u64)> = HashMap::with_capacity(networks.len());
        let mut rx_total = 0u64;
        let mut tx_total = 0u64;

        for (name, data) in networks.iter() {
            let rx = data.total_received();
            let tx = data.total_transmitted();
            // Интерфейс, которого не было в прошлом замере, стартует с нулевой
            // скоростью, а не с накопленного за всё время объёма.
            let (prev_rx, prev_tx) = self.prev_net.get(name).copied().unwrap_or((rx, tx));
            let rx_rate = (rx.saturating_sub(prev_rx) as f64 / elapsed) as u64;
            let tx_rate = (tx.saturating_sub(prev_tx) as f64 / elapsed) as u64;

            if !name.to_lowercase().contains("loopback") {
                rx_total += rx_rate;
                tx_total += tx_rate;
            }

            net_rows.push(NetInfo {
                name: name.clone(),
                rx_rate,
                tx_rate,
                total_rx: rx,
                total_tx: tx,
            });
            next_prev.insert(name.clone(), (rx, tx));
        }

        net_rows.sort_by(|a, b| {
            (b.rx_rate + b.tx_rate)
                .cmp(&(a.rx_rate + a.tx_rate))
                .then_with(|| a.name.cmp(&b.name))
        });
        self.prev_net = next_prev;

        if now.duration_since(self.disk_tick) >= DISK_REFRESH {
            let interval = now.duration_since(self.disk_tick).as_secs_f64().max(0.5);
            self.disks = Disks::new_with_refreshed_list();
            self.disk_tick = now;

            // Скорости считаем сами по приращению суммарных счётчиков:
            // после пересоздания списка sysinfo не хранит прошлые значения.
            let mut rates = HashMap::new();
            let mut totals = HashMap::new();
            for disk in self.disks.iter() {
                let mount = disk.mount_point().to_string_lossy().into_owned();
                let usage = disk.usage();
                let (prev_read, prev_write) = self
                    .prev_disk
                    .get(&mount)
                    .copied()
                    .unwrap_or((usage.total_read_bytes, usage.total_written_bytes));
                let read = (usage.total_read_bytes.saturating_sub(prev_read) as f64 / interval) as u64;
                let write =
                    (usage.total_written_bytes.saturating_sub(prev_write) as f64 / interval) as u64;
                rates.insert(mount.clone(), (read, write));
                totals.insert(mount, (usage.total_read_bytes, usage.total_written_bytes));
            }
            self.disk_rates = rates;
            self.prev_disk = totals;
        }

        let disks: Vec<DiskInfo> = self
            .disks
            .iter()
            .map(|disk| {
                let mount = disk.mount_point().to_string_lossy().into_owned();
                let (read_rate, write_rate) = self.disk_rates.get(&mount).copied().unwrap_or((0, 0));
                DiskInfo {
                    name: disk.name().to_string_lossy().into_owned(),
                    mount,
                    file_system: disk.file_system().to_string_lossy().into_owned(),
                    total: disk.total_space(),
                    available: disk.available_space(),
                    removable: disk.is_removable(),
                    kind: match disk.kind() {
                        DiskKind::SSD => "SSD".to_string(),
                        DiskKind::HDD => "HDD".to_string(),
                        _ => String::new(),
                    },
                    read_rate,
                    write_rate,
                }
            })
            .collect();

        let cpus = self.system.cpus();
        let per_core: Vec<f32> = cpus.iter().map(|cpu| round1(cpu.cpu_usage())).collect();
        let cpu_total = if per_core.is_empty() {
            0.0
        } else {
            round1(per_core.iter().sum::<f32>() / per_core.len() as f32)
        };
        let brand = cpus
            .first()
            .map(|cpu| cpu.brand().trim().to_string())
            .filter(|brand| !brand.is_empty())
            .unwrap_or_else(|| "Процессор".to_string());
        let frequency = cpus.first().map(|cpu| cpu.frequency()).unwrap_or(0);
        let threads = cpus.len();
        let cores = self.system.physical_core_count().unwrap_or(threads).max(1);

        let total_memory = self.system.total_memory();
        let used_memory = self.system.used_memory();
        let available_memory = self.system.available_memory();
        let swap_total = self.system.total_swap();
        let swap_used = self.system.used_swap();
        let mem_percent = if total_memory == 0 {
            0.0
        } else {
            round1(used_memory as f32 / total_memory as f32 * 100.0)
        };

        if refresh_processes {
            self.system.refresh_processes(ProcessesToUpdate::All, true);
            let mut rows: Vec<ProcessRow> = self
                .system
                .processes()
                .values()
                .map(|process| {
                    let usage = process.disk_usage();
                    ProcessRow {
                        pid: process.pid().as_u32(),
                        name: process.name().to_string_lossy().into_owned(),
                        // sysinfo отдаёт сумму по потокам: 178% на 16 потоках — это
                        // ~11% всей машины. Делим, чтобы совпадало с диспетчером задач.
                        cpu: round1(process.cpu_usage() / threads.max(1) as f32),
                        memory: process.memory(),
                        virtual_memory: process.virtual_memory(),
                        status: status_label(process.status()),
                        exe: process
                            .exe()
                            .map(|path| path.to_string_lossy().into_owned())
                            .unwrap_or_default(),
                        run_time: process.run_time(),
                        disk_read: usage.read_bytes,
                        disk_written: usage.written_bytes,
                    }
                })
                .collect();
            rows.sort_by(|a, b| {
                b.cpu
                    .partial_cmp(&a.cpu)
                    .unwrap_or(Ordering::Equal)
                    .then_with(|| b.memory.cmp(&a.memory))
            });
            self.rows = rows;
        }

        let process_count = self.rows.len();
        // Полные пути нужны только таблице процессов — в снимок их не тащим,
        // чтобы не сериализовать лишние килобайты каждую секунду во все окна.
        let mut top: Vec<ProcessRow> = self.rows.iter().take(TOP_PROCESSES).cloned().collect();
        for row in &mut top {
            row.exe.clear();
        }

        // Отдельный срез по памяти: у виджета свой рейтинг, сортировка по CPU
        // для этого не подходит.
        let mut memory_sorted: Vec<&ProcessRow> = self.rows.iter().collect();
        memory_sorted.sort_by(|a, b| b.memory.cmp(&a.memory));
        let top_memory: Vec<ProcessRow> = memory_sorted
            .into_iter()
            .take(3)
            .map(|row| {
                let mut row = row.clone();
                row.exe.clear();
                row
            })
            .collect();

        let ts = now_millis();
        let snapshot = Snapshot {
            ts,
            hostname: self.hostname.clone(),
            os_name: self.os_name.clone(),
            os_version: self.os_version.clone(),
            kernel: self.kernel.clone(),
            uptime: System::uptime(),
            cpu: CpuInfo {
                total: cpu_total,
                per_core,
                brand,
                frequency,
                cores,
                threads,
            },
            memory: MemoryInfo {
                total: total_memory,
                used: used_memory,
                available: available_memory,
                swap_total,
                swap_used,
            },
            disks,
            networks: net_rows,
            top,
            top_memory,
            process_count,
            battery: read_battery(),
            gpu: self.gpu.clone(),
        };

        self.history.push_back(HistoryPoint {
            ts,
            cpu: cpu_total,
            mem: mem_percent,
            rx: rx_total,
            tx: tx_total,
        });
        while self.history.len() > HISTORY_CAPACITY {
            self.history.pop_front();
        }

        self.latest = Some(snapshot.clone());
        snapshot
    }

    pub fn kill(&mut self, pid: u32) -> Result<(), String> {
        let (name, killed) = match self.system.process(Pid::from_u32(pid)) {
            Some(process) => (
                process.name().to_string_lossy().into_owned(),
                process.kill(),
            ),
            None => return Err("Процесс уже завершился".to_string()),
        };

        if killed {
            // Сразу подтягиваем список, чтобы интерфейс не показывал фантом.
            self.system.refresh_processes(ProcessesToUpdate::All, true);
            Ok(())
        } else {
            Err(format!(
                "Windows не разрешил завершить «{name}» — возможно, нужны права администратора"
            ))
        }
    }

    pub fn history_list(&self) -> Vec<HistoryPoint> {
        self.history.iter().cloned().collect()
    }
}

/// Фоновый поток: один замер в секунду (настраивается), рассылка в окно и трей.
pub fn spawn(app: AppHandle, engine: Arc<Mutex<Engine>>, settings: Arc<Mutex<Settings>>) {
    thread::spawn(move || {
        let mut ticks: u64 = 0;
        loop {
            // Игра на весь экран или ручное скрытие: виджетам нечего показывать,
            // поэтому не тратим CPU на опрос системы и рассылку.
            if crate::widgets::updates_paused() {
                thread::sleep(Duration::from_millis(600));
                continue;
            }

            let interval_ms = settings
                .lock()
                .map(|settings| settings.sample_ms.clamp(500, 5000))
                .unwrap_or(1000);

            let started = Instant::now();
            let snapshot = match engine.lock() {
                Ok(mut engine) => Some(engine.tick()),
                Err(_) => None,
            };

            if let Some(snapshot) = snapshot {
                let _ = app.emit("interface:metrics", &snapshot);
                ticks += 1;
                // Подсказку в трее обновляем реже, чтобы не дёргать оболочку.
                if ticks % 3 == 0 {
                    tray::update_tooltip(&app, &snapshot);
                }
            }

            let wait = Duration::from_millis(interval_ms).saturating_sub(started.elapsed());
            if !wait.is_zero() {
                thread::sleep(wait);
            }
        }
    });
}

fn round1(value: f32) -> f32 {
    (value * 10.0).round() / 10.0
}

fn status_label(status: ProcessStatus) -> String {
    let label = match status {
        ProcessStatus::Run => "Работает",
        ProcessStatus::Sleep => "Спит",
        ProcessStatus::Idle => "Простой",
        ProcessStatus::Stop => "Остановлен",
        ProcessStatus::Zombie => "Зомби",
        ProcessStatus::Dead => "Завершён",
        _ => "Неизвестно",
    };
    label.to_string()
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(windows)]
fn read_battery() -> Option<BatteryInfo> {
    use windows_sys::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};

    unsafe {
        let mut status: SYSTEM_POWER_STATUS = std::mem::zeroed();
        if GetSystemPowerStatus(&mut status) == 0 {
            return None;
        }

        // 128 и 255 — «батареи нет» и «неизвестно»: на стационарном ПК
        // показывать пустую батарейку бессмысленно.
        if matches!(status.BatteryFlag, 128 | 255) || status.BatteryLifePercent == 255 {
            return None;
        }

        Some(BatteryInfo {
            percent: status.BatteryLifePercent,
            charging: status.BatteryFlag & 8 != 0,
            ac_online: status.ACLineStatus == 1,
            seconds_left: if status.BatteryLifeTime == u32::MAX {
                None
            } else {
                Some(status.BatteryLifeTime)
            },
        })
    }
}

#[cfg(not(windows))]
fn read_battery() -> Option<BatteryInfo> {
    None
}
