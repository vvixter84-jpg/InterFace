import { useEffect, useMemo, useState } from "react";

import { LoadingState } from "../components/LoadingState";
import { bytes, duration, plural } from "../lib/format";
import { api } from "../lib/tauri";
import type { ProcessRow, Snapshot } from "../types";

type SortKey = "cpu" | "memory" | "name" | "pid" | "disk" | "status";

const COLUMNS: { id: SortKey; label: string; numeric?: boolean }[] = [
  { id: "name", label: "Процесс" },
  { id: "pid", label: "PID", numeric: true },
  { id: "cpu", label: "CPU", numeric: true },
  { id: "memory", label: "Память", numeric: true },
  { id: "disk", label: "Диск", numeric: true },
  { id: "status", label: "Статус" },
];

interface ProcessesPageProps {
  snapshot: Snapshot | null;
}

export function ProcessesPage({ snapshot }: ProcessesPageProps) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("cpu");
  const [rows, setRows] = useState<ProcessRow[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyPid, setBusyPid] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const data = await api.processes(sort, query, 220);
        if (!alive) return;
        setRows(data);
        setReady(true);
        setError(null);
      } catch (reason) {
        if (alive) setError(String(reason));
      }
    };

    void load();
    const timer = window.setInterval(() => void load(), 3000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [sort, query]);

  const totals = useMemo(
    () => ({
      cpu: rows.reduce((sum, row) => sum + row.cpu, 0),
    }),
    [rows],
  );

  const kill = async (row: ProcessRow) => {
    const confirmed = window.confirm(
      `Завершить «${row.name}» (PID ${row.pid})?\nНесохранённые данные приложения будут потеряны.`,
    );
    if (!confirmed) return;

    setBusyPid(row.pid);
    try {
      await api.kill(row.pid);
      setRows((current) => current.filter((item) => item.pid !== row.pid));
      setError(null);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusyPid(null);
    }
  };

  if (!ready) return <LoadingState title="Читаю список процессов…" />;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">Диспетчер задач</div>
          <h1>Процессы</h1>
        </div>
        <div className="head-meta">
          <span>{plural(rows.length, "процесс", "процесса", "процессов")}</span>
          <span className="meta-dot" />
          <span>суммарно CPU {Math.round(totals.cpu)}%</span>
          {snapshot ? (
            <>
              <span className="meta-dot" />
              <span>
                RAM {bytes(snapshot.memory.used)} из {bytes(snapshot.memory.total)}
              </span>
            </>
          ) : null}
        </div>
      </header>

      <div className="toolbar">
        <input
          className="search-input"
          type="search"
          value={query}
          placeholder="Поиск по имени или пути…"
          onChange={(event) => setQuery(event.target.value)}
        />
        <span className="toolbar-note">обновление каждые 3 секунды · сортировка по «{sort}»</span>
      </div>

      {error ? (
        <div className="inline-error" role="alert">
          {error}
        </div>
      ) : null}

      <div className="table-shell">
        <table className="table">
          <thead>
            <tr>
              {COLUMNS.map((column) => (
                <th key={column.id} className={column.numeric ? "num" : undefined}>
                  <button
                    type="button"
                    className={`sort-button${sort === column.id ? " is-active" : ""}`}
                    onClick={() => setSort(column.id)}
                  >
                    {column.label}
                    {sort === column.id ? <span className="sort-mark">↓</span> : null}
                  </button>
                </th>
              ))}
              <th className="num actions-column" aria-label="Действия" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.pid}>
                <td>
                  <div className="proc-cell">
                    <span className="proc-name">{row.name}</span>
                    <span className="proc-path truncate" title={row.exe}>
                      {row.exe || "путь недоступен"}
                    </span>
                  </div>
                </td>
                <td className="num mono">{row.pid}</td>
                <td className="num">
                  <span className={`cpu-badge${row.cpu >= 25 ? " is-hot" : ""}`}>
                    {row.cpu.toFixed(1)}%
                  </span>
                </td>
                <td className="num mono">{bytes(row.memory)}</td>
                <td className="num mono">{bytes(row.diskRead + row.diskWritten)}</td>
                <td>
                  <span className="status-cell">
                    <span className={`status-dot status-${row.status === "Работает" ? "run" : "idle"}`} />
                    {row.status}
                    <span className="status-uptime">{duration(row.runTime)}</span>
                  </span>
                </td>
                <td className="num actions-column">
                  <button
                    type="button"
                    className="kill-button"
                    title="Завершить процесс"
                    disabled={busyPid === row.pid}
                    onClick={() => void kill(row)}
                  >
                    {busyPid === row.pid ? "…" : "×"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {rows.length === 0 ? (
          <div className="table-empty">Ничего не найдено — измените запрос.</div>
        ) : null}
      </div>
    </div>
  );
}
