import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import type { HistoryPoint, ProcessRow, Settings, Snapshot, WidgetConfig } from "../types";

export const api = {
  snapshot: () => invoke<Snapshot>("get_snapshot"),
  history: () => invoke<HistoryPoint[]>("get_history"),
  processes: (sort: string, query: string, limit: number) =>
    invoke<ProcessRow[]>("list_processes", { sort, query, limit }),
  kill: (pid: number) => invoke<void>("kill_process", { pid }),
  settings: () => invoke<Settings>("get_settings"),
  saveSettings: (settings: Settings) => invoke<Settings>("save_settings", { settings }),
  saveWidgetPosition: (id: string, x: number, y: number) =>
    invoke<void>("save_widget_position", { id, x, y }),
  restoreWidgetsOrder: () => invoke<void>("restore_widgets_order"),
  setWidgetsHidden: (hidden: boolean) => invoke<void>("set_widgets_hidden", { hidden }),
  widgetsState: () => invoke<{ manualHidden: boolean; paused: boolean }>("widgets_state"),
  defaultWidgets: () => invoke<WidgetConfig[]>("default_widget_configs"),
  exportHistory: () => invoke<string>("export_history"),
};

export const onMetrics = (handler: (snapshot: Snapshot) => void): Promise<UnlistenFn> =>
  listen<Snapshot>("interface:metrics", (event) => handler(event.payload));
