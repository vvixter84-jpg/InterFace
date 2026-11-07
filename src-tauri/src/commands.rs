use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Emitter, Manager, State};

use crate::metrics::Engine;
use crate::model::{HistoryPoint, ProcessRow, Snapshot};
use crate::settings::Settings;

/// Общее состояние приложения: движок метрик и настройки живут в Arc,
/// потому что ими одновременно пользуются окно, трей и фоновый поток.
pub struct AppState {
    pub engine: Arc<Mutex<Engine>>,
    pub settings: Arc<Mutex<Settings>>,
    pub settings_path: PathBuf,
}

fn unavailable() -> String {
    "Состояние системы временно недоступно".to_string()
}

#[tauri::command]
pub fn get_snapshot(state: State<'_, AppState>) -> Result<Snapshot, String> {
    let engine = state.engine.lock().map_err(|_| unavailable())?;
    engine
        .latest
        .clone()
        .ok_or_else(|| "Первый замер ещё не готов".to_string())
}

#[tauri::command]
pub fn get_history(state: State<'_, AppState>) -> Result<Vec<HistoryPoint>, String> {
    let engine = state.engine.lock().map_err(|_| unavailable())?;
    Ok(engine.history_list())
}

#[tauri::command]
pub fn list_processes(
    state: State<'_, AppState>,
    sort: Option<String>,
    query: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<ProcessRow>, String> {
    let engine = state.engine.lock().map_err(|_| unavailable())?;
    let needle = query.unwrap_or_default().trim().to_lowercase();

    let mut rows: Vec<ProcessRow> = engine
        .rows
        .iter()
        .filter(|row| {
            needle.is_empty()
                || row.name.to_lowercase().contains(&needle)
                || row.exe.to_lowercase().contains(&needle)
        })
        .cloned()
        .collect();

    match sort.as_deref().unwrap_or("cpu") {
        "name" => rows.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase())),
        "pid" => rows.sort_by_key(|row| row.pid),
        "memory" => rows.sort_by(|a, b| b.memory.cmp(&a.memory)),
        "disk" => rows.sort_by(|a, b| {
            (b.disk_read + b.disk_written).cmp(&(a.disk_read + a.disk_written))
        }),
        "status" => rows.sort_by(|a, b| a.status.cmp(&b.status)),
        _ => rows.sort_by(|a, b| {
            b.cpu
                .partial_cmp(&a.cpu)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| b.memory.cmp(&a.memory))
        }),
    }

    rows.truncate(limit.unwrap_or(300).clamp(1, 1000));
    Ok(rows)
}

#[tauri::command]
pub fn kill_process(state: State<'_, AppState>, pid: u32) -> Result<(), String> {
    let mut engine = state.engine.lock().map_err(|_| unavailable())?;
    engine.kill(pid)
}

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Settings {
    state
        .settings
        .lock()
        .map(|settings| settings.clone())
        .unwrap_or_default()
}

#[tauri::command]
pub fn save_settings(
    app: AppHandle,
    state: State<'_, AppState>,
    settings: Settings,
) -> Result<Settings, String> {
    let settings = settings.sanitized();

    // Клавишу перерегистрируем только если она поменялась: иначе смена
    // акцента падала бы с ошибкой «сочетание занято», хотя оно не менялось.
    let hotkey_changed = state
        .settings
        .lock()
        .map(|current| current.hotkey != settings.hotkey)
        .unwrap_or(true);

    if hotkey_changed {
        crate::shortcuts::register(&app, &settings.hotkey)?;
    }
    settings.save(&state.settings_path)?;

    if let Ok(mut current) = state.settings.lock() {
        *current = settings.clone();
    }

    crate::apply_autostart(&app, settings.autostart);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_always_on_top(settings.always_on_top);
    }

    // Окна виджетов трогаем только отложенно: закрытие webview прямо внутри
    // обработчика команды подвешивает главный поток. Сначала отвечаем окну.
    crate::widgets::schedule(&app, &settings);
    let _ = app.emit("settings:changed", &settings);

    Ok(settings)
}

/// Позиция виджета сохраняется отдельно от полной настройки: окно двигают
/// мышью часто, и пересоздавать его при каждом движении нельзя.
#[tauri::command]
pub fn save_widget_position(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    x: i32,
    y: i32,
) -> Result<(), String> {
    let settings = {
        let mut settings = state.settings.lock().map_err(|_| unavailable())?;
        if let Some(widget) = settings.widgets.iter_mut().find(|widget| widget.id == id) {
            widget.x = x;
            widget.y = y;
        }
        settings.clone()
    };
    settings.save(&state.settings_path)?;
    crate::widgets::schedule_restore(&app, &settings);
    Ok(())
}

/// Окно поднимается при клике; возвращаем его на уровень рабочего стола.
#[tauri::command]
pub fn restore_widgets_order(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let settings = state.settings.lock().map_err(|_| unavailable())?.clone();
    crate::widgets::schedule_restore(&app, &settings);
    Ok(())
}

/// Состояние видимости виджетов для интерфейса.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WidgetsState {
    pub manual_hidden: bool,
    pub paused: bool,
}

#[tauri::command]
pub fn widgets_state() -> WidgetsState {
    WidgetsState {
        manual_hidden: crate::widgets::manual_hidden(),
        paused: crate::widgets::updates_paused(),
    }
}

/// Ручное скрытие виджетов (трей или кнопка в настройках) — экономит ресурсы
/// и убирает виджеты, пока они не нужны.
#[tauri::command]
pub fn set_widgets_hidden(app: AppHandle, hidden: bool) -> Result<(), String> {
    crate::widgets::set_manual_hidden(&app, hidden);
    Ok(())
}

#[tauri::command]
pub fn default_widget_configs() -> Vec<crate::settings::WidgetConfig> {
    crate::settings::default_widgets()
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
pub fn export_history(app: AppHandle, state: State<'_, AppState>) -> Result<String, String> {
    let engine = state.engine.lock().map_err(|_| unavailable())?;
    let folder = app
        .path()
        .download_dir()
        .map_err(|error| format!("не удалось найти папку «Загрузки»: {error}"))?;
    std::fs::create_dir_all(&folder)
        .map_err(|error| format!("не удалось открыть {}: {error}", folder.display()))?;

    let path = folder.join(format!("interface-{}.csv", stamp()));
    let mut csv = String::from("timestamp_ms;cpu_percent;memory_percent;rx_bytes_per_sec;tx_bytes_per_sec\n");
    for point in engine.history.iter() {
        csv.push_str(&format!(
            "{};{:.1};{:.1};{};{}\n",
            point.ts, point.cpu, point.mem, point.rx, point.tx
        ));
    }

    std::fs::write(&path, csv)
        .map_err(|error| format!("не удалось записать {}: {error}", path.display()))?;
    Ok(path.display().to_string())
}

fn stamp() -> String {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    let days = seconds / 86_400;
    let (year, month, day) = civil_from_days(days as i64);
    let rest = seconds % 86_400;
    format!(
        "{year:04}-{month:02}-{day:02}_{:02}-{:02}-{:02}",
        rest / 3600,
        (rest % 3600) / 60,
        rest % 60
    )
}

/// Перевод «дней от 1970-01-01» в календарную дату (алгоритм Хиннанта).
fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = (if z >= 0 { z } else { z - 146_096 }) / 146_097;
    let day_of_era = (z - era * 146_097) as u64;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let year = year_of_era as i64 + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let mp = (5 * day_of_year + 2) / 153;
    let day = (day_of_year - (153 * mp + 2) / 5 + 1) as u32;
    let month = (if mp < 10 { mp + 3 } else { mp - 9 }) as u32;
    (if month <= 2 { year + 1 } else { year }, month, day)
}
