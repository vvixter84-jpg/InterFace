use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

use tauri::{
    AppHandle, LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};

use crate::settings::{Settings, WidgetConfig, WIDGET_KINDS};

pub fn label(kind: &str) -> String {
    format!("widget-{kind}")
}

/// Виджеты спрятаны из-за полноэкранной игры.
static GAME_HIDDEN: AtomicBool = AtomicBool::new(false);
/// Виджеты спрятаны вручную (пункт трея или кнопка в настройках).
static MANUAL_HIDDEN: AtomicBool = AtomicBool::new(false);
/// Копия настроек для трея, автоскрытия и пересборки окон.
static SETTINGS: OnceLock<Arc<Mutex<Settings>>> = OnceLock::new();

/// Пока виджеты скрыты, сэмплер не снимает метрики и ничего не рассылает.
pub fn updates_paused() -> bool {
    GAME_HIDDEN.load(Ordering::Relaxed) || MANUAL_HIDDEN.load(Ordering::Relaxed)
}

pub fn set_game_hidden(app: &AppHandle, hidden: bool) {
    GAME_HIDDEN.store(hidden, Ordering::Relaxed);
    refresh(app);
}

pub fn set_manual_hidden(app: &AppHandle, hidden: bool) {
    MANUAL_HIDDEN.store(hidden, Ordering::Relaxed);
    refresh(app);
}

pub fn manual_hidden() -> bool {
    MANUAL_HIDDEN.load(Ordering::Relaxed)
}

/// Глобальная копия настроек: нужна трею и автоскрытию, чтобы пересобрать
/// окна без доступа к состоянию команды.
pub fn attach_settings(settings: Arc<Mutex<Settings>>) {
    let _ = SETTINGS.set(settings);
}

fn current_settings() -> Option<Settings> {
    SETTINGS.get().and_then(|settings| settings.lock().ok().map(|value| value.clone()))
}

fn refresh(app: &AppHandle) {
    let Some(settings) = current_settings() else {
        return;
    };
    let handle = app.clone();
    let app = app.clone();
    let _ = handle.run_on_main_thread(move || apply(&app, &settings));
}

/// Закрывает все окна виджетов: прятать недостаточно — WebView2 продолжает
/// держать память, а на время игры её хочется вернуть системе.
fn close_all(app: &AppHandle) {
    for kind in WIDGET_KINDS {
        if let Some(window) = app.get_webview_window(&label(kind)) {
            let _ = window.close();
        }
    }
    if let Ok(mut map) = transparency().lock() {
        map.clear();
    }
}

/// Ставит синхронизацию окон виджетов в очередь главного потока.
///
/// Вызывать `apply` напрямую из команды нельзя: синхронные команды Tauri
/// выполняются в главном потоке, а `run_on_main_thread` в этом случае
/// выполняет задачу немедленно — создание и закрытие webview внутри
/// обработчика IPC подвешивает приложение. Поэтому сначала уходим в отдельный
/// поток, а уже оттуда просим главный поток.
pub fn schedule(app: &AppHandle, settings: &Settings) {
    let app = app.clone();
    let settings = settings.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(30));
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || apply(&handle, &settings));
    });
}

/// То же для возврата виджетов на уровень рабочего стола после клика.
pub fn schedule_restore(app: &AppHandle, settings: &Settings) {
    let app = app.clone();
    let settings = settings.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(120));
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || restore_desktop_order(&handle, &settings));
    });
}

/// Синхронизирует окна виджетов с настройками: создаёт недостающие,
/// закрывает выключенные, применяет размер, позицию и режим «на рабочем столе».
///
/// Вызывать только из главного потока — создание окна иначе падает.
pub fn apply(app: &AppHandle, settings: &Settings) {
    // Игра на весь экран или ручное скрытие: окна закрываем целиком,
    // чтобы WebView2 вернул память системе.
    if updates_paused() {
        close_all(app);
        return;
    }

    for kind in WIDGET_KINDS {
        let Some(config) = settings.widgets.iter().find(|widget| widget.id == kind) else {
            continue;
        };

        let window_label = label(kind);
        let mut existing = app.get_webview_window(&window_label);
        let wanted = settings.widgets_enabled && config.enabled;

        if !wanted {
            if let Some(window) = existing {
                let _ = window.close();
            }
            if let Ok(mut map) = transparency().lock() {
                map.remove(kind);
            }
            continue;
        }

        // Прозрачность задаётся при создании окна и не меняется на лету:
        // если пользователь переключил режим, окно пересоздаём.
        let previous = transparency().lock().ok().and_then(|map| map.get(kind).copied());
        if existing.is_some() && previous != Some(config.transparent) {
            if let Some(window) = existing.take() {
                let _ = window.close();
            }
        }

        let window = match existing {
            Some(window) => window,
            None => match create(app, kind, config) {
                Ok(window) => {
                    if let Ok(mut map) = transparency().lock() {
                        map.insert(kind.to_string(), config.transparent);
                    }
                    window
                }
                Err(error) => {
                    eprintln!("[interface] виджет «{kind}» не создан: {error}");
                    continue;
                }
            },
        };

        sync_geometry(&window, config);
        apply_desktop_mode(&window, settings.widgets_mode == "desktop");
        if updates_paused() {
            let _ = window.hide();
        } else {
            let _ = window.show();
        }
    }
}

fn transparency() -> &'static Mutex<HashMap<String, bool>> {
    static MAP: OnceLock<Mutex<HashMap<String, bool>>> = OnceLock::new();
    MAP.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Двигает и растягивает окно только если оно реально отличается от настроек:
/// лишние `SetWindowPos` порождают события Move и лишние сохранения.
fn sync_geometry(window: &WebviewWindow, config: &WidgetConfig) {
    let scale = window.scale_factor().unwrap_or(1.0);

    let wanted_size = LogicalSize::new(config.width, config.height).to_physical::<u32>(scale);
    let size_matches = window
        .outer_size()
        .map(|size| size.width.abs_diff(wanted_size.width) <= 2 && size.height.abs_diff(wanted_size.height) <= 2)
        .unwrap_or(false);
    if !size_matches {
        let _ = window.set_size(LogicalSize::new(config.width, config.height));
    }

    let wanted_x = (config.x as f64 * scale).round() as i32;
    let wanted_y = (config.y as f64 * scale).round() as i32;
    let position_matches = window
        .outer_position()
        .map(|position| {
            position.x.abs_diff(wanted_x) <= 3 && position.y.abs_diff(wanted_y) <= 3
        })
        .unwrap_or(false);
    if !position_matches {
        let _ = window.set_position(LogicalPosition::new(config.x as f64, config.y as f64));
    }
}

/// Возвращает виджеты на уровень рабочего стола после клика или перетаскивания:
/// Windows поднимает окно при активации, и без этого оно осталось бы поверх.
pub fn restore_desktop_order(app: &AppHandle, settings: &Settings) {
    if settings.widgets_mode != "desktop" || !settings.widgets_enabled {
        return;
    }
    for kind in WIDGET_KINDS {
        if let Some(window) = app.get_webview_window(&label(kind)) {
            apply_desktop_mode(&window, true);
        }
    }
}

fn create(app: &AppHandle, kind: &str, config: &WidgetConfig) -> tauri::Result<WebviewWindow> {
    WebviewWindowBuilder::new(app, label(kind), WebviewUrl::App("index.html".into()))
        .title("InterFace")
        .inner_size(config.width, config.height)
        .position(config.x as f64, config.y as f64)
        .decorations(false)
        .transparent(config.transparent)
        .shadow(false)
        .skip_taskbar(true)
        .always_on_top(false)
        .resizable(true)
        .visible(false)
        .build()
}

/// В режиме рабочего стола окно получает WS_EX_NOACTIVATE (клик по виджету
/// не поднимает его над приложениями) и ставится сразу над окном рабочего
/// стола `Progman`. Так оно выше обоев и иконок, но ниже любых обычных окон.
fn apply_desktop_mode(window: &WebviewWindow, desktop: bool) {
    #[cfg(windows)]
    {
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            FindWindowW, GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, GWL_EXSTYLE,
            SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, WS_EX_APPWINDOW, WS_EX_NOACTIVATE,
            WS_EX_TOOLWINDOW,
        };

        let Ok(hwnd) = window.hwnd() else {
            return;
        };
        let hwnd = hwnd.0 as isize as *mut core::ffi::c_void;

        unsafe {
            let mut style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
            if desktop {
                style |= WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW;
                style &= !WS_EX_APPWINDOW;
            } else {
                style &= !WS_EX_NOACTIVATE;
            }
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, style as isize);

            if desktop {
                let class: Vec<u16> = "Progman\0".encode_utf16().collect();
                let progman = FindWindowW(class.as_ptr(), std::ptr::null());
                // Ставим окно сразу после рабочего стола: HWND_BOTTOM (1)
                // утопил бы виджет под иконки.
                let insert_after = if progman.is_null() {
                    1isize as *mut core::ffi::c_void
                } else {
                    progman
                };
                SetWindowPos(
                    hwnd,
                    insert_after,
                    0,
                    0,
                    0,
                    0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
                );
            }
        }
    }

    #[cfg(not(windows))]
    {
        let _ = (window, desktop);
    }
}
