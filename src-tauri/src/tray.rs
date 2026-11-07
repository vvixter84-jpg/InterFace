use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{App, AppHandle, Manager};

use crate::model::Snapshot;

/// Иконка в системном трее — основной способ держать InterFace под рукой:
/// окно живёт свёрнутым, а состояние видно по подсказке.
///
/// Возвращаем строку, а не tauri::Error: вызывающий код должен уметь
/// продолжить работу без трея (например, если оболочка недоступна).
pub fn setup(app: &App) -> Result<(), String> {
    let open = MenuItem::with_id(app, "open", "Открыть InterFace", true, None::<&str>)
        .map_err(|error| format!("пункт меню «Открыть»: {error}"))?;
    let toggle = MenuItem::with_id(app, "toggle", "Свернуть / показать", true, None::<&str>)
        .map_err(|error| format!("пункт меню «Свернуть»: {error}"))?;
    let hide_widgets = MenuItem::with_id(app, "widgets-hide", "Скрыть виджеты", true, None::<&str>)
        .map_err(|error| format!("пункт меню «Скрыть виджеты»: {error}"))?;
    let show_widgets = MenuItem::with_id(app, "widgets-show", "Показать виджеты", true, None::<&str>)
        .map_err(|error| format!("пункт меню «Показать виджеты»: {error}"))?;
    let separator = PredefinedMenuItem::separator(app)
        .map_err(|error| format!("разделитель меню: {error}"))?;
    let quit = MenuItem::with_id(app, "quit", "Выход", true, None::<&str>)
        .map_err(|error| format!("пункт меню «Выход»: {error}"))?;
    let menu = Menu::with_items(
        app,
        &[&open, &toggle, &hide_widgets, &show_widgets, &separator, &quit],
    )
    .map_err(|error| format!("меню трея: {error}"))?;

    let mut builder = TrayIconBuilder::with_id("tray")
        .tooltip("InterFace")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_window(app),
            "toggle" => toggle_window(app),
            "widgets-hide" => crate::widgets::set_manual_hidden(app, true),
            "widgets-show" => crate::widgets::set_manual_hidden(app, false),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }

    builder
        .build(app)
        .map_err(|error| format!("иконка трея: {error}"))?;
    Ok(())
}

pub fn show_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// Клик по трею и глобальная клавиша переключают окно: если оно на виду
/// и в фокусе — прячем, иначе поднимаем поверх остальных.
pub fn toggle_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let visible = window.is_visible().unwrap_or(false);
        let focused = window.is_focused().unwrap_or(false);
        if visible && focused {
            let _ = window.hide();
        } else {
            show_window(app);
        }
    }
}

pub fn update_tooltip(app: &AppHandle, snapshot: &Snapshot) {
    let Some(tray) = app.tray_by_id("tray") else {
        return;
    };
    let memory = if snapshot.memory.total == 0 {
        0.0
    } else {
        snapshot.memory.used as f64 / snapshot.memory.total as f64 * 100.0
    };
    let text = format!(
        "InterFace · CPU {:.0}% · RAM {:.0}%",
        snapshot.cpu.total, memory
    );
    let _ = tray.set_tooltip(Some(text));
}
