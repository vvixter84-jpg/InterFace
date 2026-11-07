use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

pub const DEFAULT_ACCENT: &str = "#F2F2F4";
pub const DEFAULT_HOTKEY: &str = "Ctrl+Shift+A";

/// Порядок и базовые размеры шести виджетов. Позиции по умолчанию —
/// лесенкой в левой части экрана, чтобы при первом включении ничего
/// не наезжало друг на друга.
pub const WIDGET_KINDS: [&str; 12] = [
    "cpu",
    "memory",
    "network",
    "disks",
    "processes",
    "clock",
    "battery",
    "diskio",
    "memorytop",
    "calendar",
    "cpuactivity",
    "gpu",
];

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct WidgetConfig {
    pub id: String,
    pub enabled: bool,
    pub x: i32,
    pub y: i32,
    pub width: f64,
    pub height: f64,
    /// Непрозрачность подложки: 0.15 — почти стекло, 1.0 — плотный чёрный.
    pub opacity: f64,
    /// Масштаб текста внутри виджета.
    pub scale: f64,
    /// Свой акцент; None — использовать общий акцент приложения.
    pub accent: Option<String>,
    pub chart: bool,
    pub label: bool,
    /// Прозрачное окно (стекло поверх обоев) — красивее, но дороже:
    /// каждое такое окно заставляет DWM пересобирать композицию.
    pub transparent: bool,
}

impl Default for WidgetConfig {
    fn default() -> Self {
        Self {
            id: "cpu".to_string(),
            enabled: false,
            x: 40,
            y: 40,
            width: 280.0,
            height: 160.0,
            opacity: 0.86,
            scale: 1.0,
            accent: None,
            chart: true,
            label: true,
            transparent: false,
        }
    }
}

pub fn default_widgets() -> Vec<WidgetConfig> {
    let presets: [(&str, i32, i32, f64, f64, bool); 12] = [
        ("cpu", 40, 40, 280.0, 168.0, true),
        ("memory", 344, 40, 280.0, 168.0, true),
        ("network", 648, 40, 280.0, 168.0, false),
        ("disks", 952, 40, 340.0, 180.0, false),
        ("processes", 40, 232, 320.0, 190.0, false),
        ("clock", 384, 232, 260.0, 150.0, false),
        ("battery", 668, 232, 260.0, 150.0, false),
        ("diskio", 952, 240, 340.0, 190.0, false),
        ("memorytop", 40, 444, 320.0, 170.0, false),
        ("calendar", 384, 400, 300.0, 265.0, false),
        ("cpuactivity", 708, 400, 300.0, 190.0, false),
        ("gpu", 1032, 460, 280.0, 180.0, false),
    ];

    presets
        .into_iter()
        .map(|(id, x, y, width, height, enabled)| WidgetConfig {
            id: id.to_string(),
            enabled,
            x,
            y,
            width,
            height,
            ..WidgetConfig::default()
        })
        .collect()
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub accent: String,
    pub hotkey: String,
    pub autostart: bool,
    pub start_minimized: bool,
    /// Крестик прячет окно в трей; выключено — приложение закрывается.
    pub close_to_tray: bool,
    pub alerts: bool,
    pub always_on_top: bool,
    pub sample_ms: u64,
    /// Показывать ASCII-меню запуска при открытии окна.
    pub show_boot_menu: bool,
    /// Показывать ли виджеты вообще.
    pub widgets_enabled: bool,
    /// "desktop" — на рабочем столе под окнами, "window" — обычные окна.
    pub widgets_mode: String,
    /// Прятать виджеты, когда активно полноэкранное приложение.
    pub auto_hide_fullscreen: bool,
    pub widgets: Vec<WidgetConfig>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            accent: DEFAULT_ACCENT.to_string(),
            hotkey: DEFAULT_HOTKEY.to_string(),
            autostart: false,
            start_minimized: false,
            close_to_tray: true,
            alerts: true,
            always_on_top: false,
            sample_ms: 1000,
            show_boot_menu: true,
            widgets_enabled: false,
            widgets_mode: "desktop".to_string(),
            auto_hide_fullscreen: true,
            widgets: default_widgets(),
        }
    }
}

impl Settings {
    /// Настройки читаются один раз при старте: битый или неполный файл
    /// не должен мешать запуску — просто берём значения по умолчанию.
    pub fn load(path: &Path) -> Self {
        match fs::read_to_string(path) {
            Ok(text) => {
                // Блокнот и PowerShell 5.1 пишут UTF-8 с BOM — убираем его,
                // иначе serde_json падает уже на первом символе.
                let text = text.trim_start_matches('\u{feff}');
                match serde_json::from_str::<Settings>(text) {
                    Ok(settings) => settings.sanitized(),
                    Err(error) => {
                        eprintln!("[interface] настройки не разобраны ({error}), беру значения по умолчанию");
                        Settings::default()
                    }
                }
            }
            Err(error) => {
                eprintln!(
                    "[interface] настройки не прочитаны из {} ({error}), беру значения по умолчанию",
                    path.display()
                );
                Settings::default()
            }
        }
    }

    pub fn save(&self, path: &Path) -> Result<(), String> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("не удалось создать {}: {error}", parent.display()))?;
        }
        let json = serde_json::to_string_pretty(self).map_err(|error| error.to_string())?;
        fs::write(path, json)
            .map_err(|error| format!("не удалось сохранить настройки {}: {error}", path.display()))
    }

    pub fn sanitized(mut self) -> Self {
        self.sample_ms = self.sample_ms.clamp(500, 5000);
        if !is_hex_color(&self.accent) {
            self.accent = DEFAULT_ACCENT.to_string();
        }
        if self.hotkey.trim().is_empty() {
            self.hotkey = DEFAULT_HOTKEY.to_string();
        }
        if self.widgets_mode != "window" {
            self.widgets_mode = "desktop".to_string();
        }

        // Приводим список к шести известным видам: убираем дубли и мусор,
        // недостающие добавляем из пресетов, значения зажимаем в разумные рамки.
        let fallback = default_widgets();
        let mut result = Vec::with_capacity(WIDGET_KINDS.len());
        for kind in WIDGET_KINDS {
            let mut widget = self
                .widgets
                .iter()
                .find(|widget| widget.id == kind)
                .cloned()
                .or_else(|| fallback.iter().find(|widget| widget.id == kind).cloned())
                .unwrap_or_default();

            widget.id = kind.to_string();
            widget.width = widget.width.clamp(180.0, 620.0);
            widget.height = widget.height.clamp(90.0, 420.0);
            widget.opacity = widget.opacity.clamp(0.15, 1.0);
            widget.scale = widget.scale.clamp(0.7, 1.6);
            if let Some(accent) = &widget.accent {
                if !is_hex_color(accent) {
                    widget.accent = None;
                }
            }
            result.push(widget);
        }
        self.widgets = result;
        self
    }
}

pub fn is_hex_color(value: &str) -> bool {
    let bytes = value.as_bytes();
    matches!(bytes.len(), 4 | 7)
        && bytes[0] == b'#'
        && bytes[1..].iter().all(|byte| byte.is_ascii_hexdigit())
}
