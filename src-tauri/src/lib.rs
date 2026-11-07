mod autohide;
mod commands;
mod gpu;
mod metrics;
mod model;
mod settings;
mod shortcuts;
mod tray;
mod widgets;

use std::sync::{Arc, Mutex};

use tauri::{Manager, WindowEvent};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

use crate::commands::AppState;
use crate::settings::Settings;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let context = tauri::generate_context!();

    // WebView2 сам создаёт папку профиля, но под антивирусом/EDR это может
    // закончиться ERROR_ACCESS_DENIED ещё до вызова setup — окно не появится.
    // Готовим каталог заранее, пока ни одного окна ещё нет.
    #[cfg(windows)]
    prepare_webview_data_dir(&context.config().identifier);

    tauri::Builder::default()
        // Должен регистрироваться первым: повторный запуск поднимает окно,
        // а не плодит второй экземпляр со своим потоком опроса.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            tray::show_window(app);
        }))
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                        tray::toggle_window(app);
                    }
                })
                .build(),
        )
        .setup(|app| {
            let handle = app.handle().clone();

            let config_dir = app.path().app_config_dir()?;
            if let Err(error) = std::fs::create_dir_all(&config_dir) {
                eprintln!(
                    "[interface] не удалось создать {}: {error}",
                    config_dir.display()
                );
            }
            let settings = Settings::load(&config_dir.join("settings.json"));

            let engine = Arc::new(Mutex::new(metrics::Engine::new()));
            let settings_state = Arc::new(Mutex::new(settings.clone()));

            app.manage(AppState {
                engine: engine.clone(),
                settings: settings_state.clone(),
                settings_path: config_dir.join("settings.json"),
            });

            widgets::attach_settings(settings_state.clone());

            // Трей — не критичная часть: без него приложение всё равно
            // должно открыться (например, если проводник перезапускается).
            if let Err(error) = tray::setup(app) {
                eprintln!("[interface] трей недоступен: {error}");
            }

            if let Err(error) = shortcuts::register(&handle, &settings.hotkey) {
                eprintln!("[interface] {error}");
            }
            apply_autostart(&handle, settings.autostart);

            widgets::apply(&handle, &settings);

            if let Some(window) = app.get_webview_window("main") {
                let target = window.clone();
                let settings_for_close = settings_state.clone();
                let app_for_close = app.handle().clone();
                window.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        // По умолчанию крестик прячет окно в трей; если в настройках
                        // выключено — приложение действительно закрывается.
                        let close_to_tray = settings_for_close
                            .lock()
                            .map(|settings| settings.close_to_tray)
                            .unwrap_or(true);
                        if close_to_tray {
                            api.prevent_close();
                            let _ = target.hide();
                        } else {
                            app_for_close.exit(0);
                        }
                    }
                });

                let _ = window.set_always_on_top(settings.always_on_top);

                let minimized = settings.start_minimized
                    || std::env::args().any(|argument| argument == "--minimized");
                if !minimized {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }

            metrics::spawn(handle.clone(), engine, settings_state.clone());
            autohide::start(handle, settings_state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_snapshot,
            commands::get_history,
            commands::list_processes,
            commands::kill_process,
            commands::get_settings,
            commands::save_settings,
            commands::save_widget_position,
            commands::restore_widgets_order,
            commands::set_widgets_hidden,
            commands::widgets_state,
            commands::default_widget_configs,
            commands::export_history,
        ])
        .run(context)
        .expect("не удалось запустить InterFace");
}

/// Каталог, который WebView2 использует как профиль браузера:
/// `%LOCALAPPDATA%\<identifier>`. Создаём его до старта окон.
#[cfg(windows)]
fn prepare_webview_data_dir(identifier: &str) {
    let Some(base) = std::env::var_os("LOCALAPPDATA") else {
        return;
    };
    let dir = std::path::Path::new(&base).join(identifier);
    if let Err(error) = std::fs::create_dir_all(&dir) {
        eprintln!(
            "[interface] не удалось подготовить {}: {error}",
            dir.display()
        );
    }
}

/// Автозапуск меняется через реестр Windows; ошибку только логируем —
/// приложение обязано работать и без этой привилегии.
pub(crate) fn apply_autostart(app: &tauri::AppHandle, enabled: bool) {
    let manager = app.autolaunch();
    let result = if enabled {
        manager.enable()
    } else {
        manager.disable()
    };
    if let Err(error) = result {
        eprintln!("[interface] не удалось изменить автозапуск: {error}");
    }
}
