use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::AppHandle;

use crate::settings::Settings;

/// Следит за полноэкранными приложениями (игры, видео, презентации) и просит
/// модуль виджетов спрятать их. Пока виджеты скрыты, сэмплер не снимает метрики.
pub fn start(app: AppHandle, settings: Arc<Mutex<Settings>>) {
    std::thread::spawn(move || {
        let mut hidden = false;
        loop {
            let enabled = settings
                .lock()
                .map(|settings| settings.auto_hide_fullscreen && settings.widgets_enabled)
                .unwrap_or(false);

            let should_hide = enabled && is_fullscreen_active();
            if should_hide != hidden {
                hidden = should_hide;
                crate::widgets::set_game_hidden(&app, should_hide);
                eprintln!(
                    "[interface] полноэкранный режим: виджеты {}",
                    if should_hide { "скрыты" } else { "показаны" }
                );
            }

            std::thread::sleep(Duration::from_millis(1200));
        }
    });
}

/// Полноэкранное приложение определяется двумя способами:
/// 1) оболочка сама сообщает, что идёт D3D-полноэкранный режим или презентация;
/// 2) активное окно другого процесса занимает весь монитор (borderless-игры).
#[cfg(windows)]
fn is_fullscreen_active() -> bool {
    use windows_sys::Win32::Graphics::Gdi::{
        GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
    };
    use windows_sys::Win32::UI::Shell::{
        SHQueryUserNotificationState, QUNS_PRESENTATION_MODE, QUNS_RUNNING_D3D_FULL_SCREEN,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowRect, GetWindowThreadProcessId, IsWindowVisible,
    };

    unsafe {
        let mut state: i32 = 0;
        if SHQueryUserNotificationState(&mut state) == 0
            && (state == QUNS_RUNNING_D3D_FULL_SCREEN || state == QUNS_PRESENTATION_MODE)
        {
            return true;
        }

        let window = GetForegroundWindow();
        if window.is_null() || IsWindowVisible(window) == 0 {
            return false;
        }

        let mut pid = 0u32;
        GetWindowThreadProcessId(window, &mut pid);
        if pid == std::process::id() {
            return false;
        }

        let mut rect = std::mem::zeroed();
        if GetWindowRect(window, &mut rect) == 0 {
            return false;
        }

        let monitor = MonitorFromWindow(window, MONITOR_DEFAULTTONEAREST);
        let mut info: MONITORINFO = std::mem::zeroed();
        info.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
        if GetMonitorInfoW(monitor, &mut info) == 0 {
            return false;
        }

        let screen = info.rcMonitor;
        rect.left <= screen.left + 2
            && rect.top <= screen.top + 2
            && rect.right >= screen.right - 2
            && rect.bottom >= screen.bottom - 2
    }
}

#[cfg(not(windows))]
fn is_fullscreen_active() -> bool {
    false
}
