import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "../lib/tauri";
import type { Settings, WidgetConfig } from "../types";

const base = {
  opacity: 0.86,
  scale: 1,
  accent: null,
  chart: true,
  label: true,
  transparent: false,
};

// Запасные значения до загрузки настроек: те же, что в Rust (settings.rs).
const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: "cpu", enabled: true, x: 40, y: 40, width: 280, height: 168, ...base },
  { id: "memory", enabled: true, x: 344, y: 40, width: 280, height: 168, ...base },
  { id: "network", enabled: false, x: 648, y: 40, width: 280, height: 168, ...base },
  { id: "disks", enabled: false, x: 952, y: 40, width: 340, height: 180, ...base },
  { id: "processes", enabled: false, x: 40, y: 232, width: 320, height: 190, ...base },
  { id: "clock", enabled: false, x: 384, y: 232, width: 260, height: 150, ...base },
  { id: "battery", enabled: false, x: 668, y: 232, width: 260, height: 150, ...base },
  { id: "diskio", enabled: false, x: 952, y: 240, width: 340, height: 190, ...base },
  { id: "memorytop", enabled: false, x: 40, y: 444, width: 320, height: 170, ...base },
  { id: "calendar", enabled: false, x: 384, y: 400, width: 300, height: 265, ...base },
  { id: "cpuactivity", enabled: false, x: 708, y: 400, width: 300, height: 190, ...base },
  { id: "gpu", enabled: false, x: 1032, y: 460, width: 280, height: 180, ...base },
];

export const DEFAULT_SETTINGS: Settings = {
  accent: "#F2F2F4",
  hotkey: "Ctrl+Shift+A",
  autostart: false,
  startMinimized: false,
  closeToTray: true,
  alerts: true,
  alwaysOnTop: false,
  sampleMs: 1000,
  showBootMenu: true,
  widgetsEnabled: false,
  widgetsMode: "desktop",
  autoHideFullscreen: true,
  widgets: DEFAULT_WIDGETS,
};

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const current = useRef(settings);
  current.current = settings;

  useEffect(() => {
    let alive = true;
    api
      .settings()
      .then((loaded) => {
        if (alive) setSettings({ ...DEFAULT_SETTINGS, ...loaded });
      })
      .catch((error: unknown) => {
        console.error("не удалось прочитать настройки", error);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Возвращает текст ошибки или null: настройки применяются на бэкенде
  // (хоткей, автозапуск, поверх окон), поэтому подтверждение приходит оттуда.
  const update = useCallback(async (patch: Partial<Settings>): Promise<string | null> => {
    const previous = current.current;
    const next = { ...previous, ...patch };
    setSettings(next);
    try {
      const saved = await api.saveSettings(next);
      setSettings({ ...DEFAULT_SETTINGS, ...saved });
      return null;
    } catch (error) {
      setSettings(previous);
      return typeof error === "string" ? error : String(error);
    }
  }, []);

  return { settings, update };
}
