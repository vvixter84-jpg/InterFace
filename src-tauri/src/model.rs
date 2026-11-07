use serde::Serialize;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CpuInfo {
    pub total: f32,
    pub per_core: Vec<f32>,
    pub brand: String,
    pub frequency: u64,
    pub cores: usize,
    pub threads: usize,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryInfo {
    pub total: u64,
    pub used: u64,
    pub available: u64,
    pub swap_total: u64,
    pub swap_used: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskInfo {
    pub name: String,
    pub mount: String,
    pub file_system: String,
    pub total: u64,
    pub available: u64,
    pub removable: bool,
    pub kind: String,
    /// Скорость чтения и записи за последний интервал опроса дисков.
    pub read_rate: u64,
    pub write_rate: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetInfo {
    pub name: String,
    pub rx_rate: u64,
    pub tx_rate: u64,
    pub total_rx: u64,
    pub total_tx: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessRow {
    pub pid: u32,
    pub name: String,
    pub cpu: f32,
    pub memory: u64,
    pub virtual_memory: u64,
    pub status: String,
    pub exe: String,
    pub run_time: u64,
    pub disk_read: u64,
    pub disk_written: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatteryInfo {
    pub percent: u8,
    pub charging: bool,
    pub ac_online: bool,
    pub seconds_left: Option<u32>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub ts: u64,
    pub hostname: String,
    pub os_name: String,
    pub os_version: String,
    pub kernel: String,
    pub uptime: u64,
    pub cpu: CpuInfo,
    pub memory: MemoryInfo,
    pub disks: Vec<DiskInfo>,
    pub networks: Vec<NetInfo>,
    pub top: Vec<ProcessRow>,
    /// Топ процессов по занятой памяти — отдельный срез для виджета.
    pub top_memory: Vec<ProcessRow>,
    pub process_count: usize,
    pub battery: Option<BatteryInfo>,
    pub gpu: Option<crate::gpu::GpuInfo>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryPoint {
    pub ts: u64,
    pub cpu: f32,
    pub mem: f32,
    pub rx: u64,
    pub tx: u64,
}
