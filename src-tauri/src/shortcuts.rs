use std::str::FromStr;

use tauri::AppHandle;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

/// Перерегистрирует единственную глобальную клавишу приложения.
/// Старое сочетание снимается всегда, чтобы смена не «залипала».
pub fn register(app: &AppHandle, hotkey: &str) -> Result<(), String> {
    let shortcut = Shortcut::from_str(hotkey.trim()).map_err(|error| {
        format!("не удалось разобрать сочетание «{hotkey}»: {error}")
    })?;

    let manager = app.global_shortcut();
    manager
        .unregister_all()
        .map_err(|error| format!("не удалось снять старое сочетание: {error}"))?;
    manager.register(shortcut).map_err(|error| {
        format!("сочетание «{hotkey}» не зарегистрировано — вероятно, его занимает другая программа: {error}")
    })?;
    Ok(())
}
