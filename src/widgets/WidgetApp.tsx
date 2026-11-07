import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { api, onMetrics } from "../lib/tauri";
import type { HistoryPoint, Settings, Snapshot, WidgetConfig, WidgetKind } from "../types";
import { WidgetView } from "./WidgetView";

const appWindow = getCurrentWindow();
const MAX_POINTS = 60;

interface WidgetAppProps {
  kind: WidgetKind;
}

export function WidgetApp({ kind }: WidgetAppProps) {
  const [config, setConfig] = useState<WidgetConfig | null>(null);
  const [accent, setAccent] = useState("#F2F2F4");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);

  useEffect(() => {
    let alive = true;
    const unlisteners: Array<() => void> = [];
    let stopMetrics: (() => void) | undefined;

    const accept = (payload: Snapshot) => {
      if (!alive) return;
      setSnapshot(payload);
      const memory =
        payload.memory.total > 0 ? (payload.memory.used / payload.memory.total) * 100 : 0;
      const rx = payload.networks.reduce((sum, item) => sum + item.rxRate, 0);
      const tx = payload.networks.reduce((sum, item) => sum + item.txRate, 0);

      setHistory((current) => {
        const next = [
          ...current,
          { ts: payload.ts, cpu: payload.cpu.total, mem: memory, rx, tx },
        ];
        return next.length > MAX_POINTS ? next.slice(next.length - MAX_POINTS) : next;
      });
    };

    const applySettings = (settings: Settings) => {
      const widget = settings.widgets.find((item) => item.id === kind);
      if (!widget) return;
      setConfig(widget);
      setAccent(widget.accent ?? settings.accent);
    };

    void (async () => {
      try {
        const [settings, initial] = await Promise.all([api.settings(), api.snapshot()]);
        if (!alive) return;
        applySettings(settings);
        accept(initial);
      } catch (error) {
        console.error("виджет: не удалось получить настройки", error);
      }

      const stopSettings = await listen<Settings>("settings:changed", (event) => {
        applySettings(event.payload);
      });
      if (alive) {
        unlisteners.push(stopSettings);
      } else {
        stopSettings();
      }

      const stop = await onMetrics(accept);
      if (alive) {
        stopMetrics = stop;
      } else {
        stop();
      }
    })();

    return () => {
      alive = false;
      stopMetrics?.();
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [kind]);

  // Позицию сохраняем с задержкой: событие Move приходит на каждый пиксель.
  useEffect(() => {
    let timer: number | undefined;
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void appWindow
      .onMoved(({ payload }) => {
        if (disposed) return;
        const ratio = window.devicePixelRatio || 1;
        const x = Math.round(payload.x / ratio);
        const y = Math.round(payload.y / ratio);
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          void api
            .saveWidgetPosition(kind, x, y)
            .catch((error: unknown) => console.error("виджет: позиция не сохранена", error));
        }, 400);
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      });

    return () => {
      disposed = true;
      window.clearTimeout(timer);
      unlisten?.();
    };
  }, [kind]);

  // Непрозрачное окно не умеет показывать скругления поверх обоев:
  // подкладываем тёмный фон страницы, иначе углы будут белыми.
  useEffect(() => {
    document.documentElement.classList.toggle("is-solid", Boolean(config && !config.transparent));
  }, [config]);

  if (!config) return <div className="widget widget-loading" />;

  return (
    <WidgetView
      kind={kind}
      config={config}
      snapshot={snapshot}
      accent={accent}
      history={history}
    />
  );
}
