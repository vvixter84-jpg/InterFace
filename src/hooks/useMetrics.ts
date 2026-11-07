import { useCallback, useEffect, useRef, useState } from "react";

import { api, onMetrics } from "../lib/tauri";
import type { HistoryPoint, Snapshot } from "../types";

export interface AppAlert {
  id: number;
  kind: "warn" | "danger";
  text: string;
}

const MAX_POINTS = 300;
const CPU_LIMIT = 90;
const MEMORY_LIMIT = 92;
const SUSTAINED = 5;
const COOLDOWN_MS = 60_000;
const ALERT_TTL_MS = 10_000;

export function useMetrics(alertsEnabled: boolean) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [alerts, setAlerts] = useState<AppAlert[]>([]);

  const alertsEnabledRef = useRef(alertsEnabled);
  alertsEnabledRef.current = alertsEnabled;

  const streak = useRef({ cpu: 0, memory: 0 });
  const lastAlert = useRef({ cpu: 0, memory: 0 });
  const alertId = useRef(0);

  const pushAlert = useCallback((kind: AppAlert["kind"], text: string) => {
    const id = alertId.current + 1;
    alertId.current = id;
    setAlerts((current) => [...current.slice(-2), { id, kind, text }]);
    window.setTimeout(() => {
      setAlerts((current) => current.filter((alert) => alert.id !== id));
    }, ALERT_TTL_MS);
  }, []);

  useEffect(() => {
    let alive = true;
    let unlisten: (() => void) | undefined;

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

      if (!alertsEnabledRef.current) {
        streak.current = { cpu: 0, memory: 0 };
        return;
      }

      const now = Date.now();
      streak.current.cpu = payload.cpu.total >= CPU_LIMIT ? streak.current.cpu + 1 : 0;
      streak.current.memory = memory >= MEMORY_LIMIT ? streak.current.memory + 1 : 0;

      if (streak.current.cpu === SUSTAINED && now - lastAlert.current.cpu > COOLDOWN_MS) {
        lastAlert.current.cpu = now;
        pushAlert(
          "danger",
          `Процессор загружен на ${Math.round(payload.cpu.total)}% дольше нескольких секунд`,
        );
      }

      if (streak.current.memory === SUSTAINED && now - lastAlert.current.memory > COOLDOWN_MS) {
        lastAlert.current.memory = now;
        pushAlert(
          "warn",
          `Память заполнена на ${Math.round(memory)}% — стоит закрыть лишние приложения`,
        );
      }
    };

    void (async () => {
      try {
        const [initial, stored] = await Promise.all([api.snapshot(), api.history()]);
        if (alive) {
          setSnapshot(initial);
          setHistory(stored.slice(-MAX_POINTS));
        }
      } catch (error) {
        console.error("не удалось получить первый замер", error);
      }

      const stop = await onMetrics(accept);
      if (alive) {
        unlisten = stop;
      } else {
        stop();
      }
    })();

    return () => {
      alive = false;
      unlisten?.();
    };
  }, [pushAlert]);

  const dismiss = useCallback((id: number) => {
    setAlerts((current) => current.filter((alert) => alert.id !== id));
  }, []);

  return { snapshot, history, alerts, dismiss };
}
