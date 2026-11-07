import type { Snapshot } from "../types";
import {
  IconNetwork,
  IconOverview,
  IconProcesses,
  IconSettings,
  IconStorage,
  IconWidgets,
} from "./icons";

export type Tab = "overview" | "processes" | "storage" | "network" | "widgets" | "settings";

interface TabItem {
  id: Tab;
  label: string;
  icon: typeof IconOverview;
}

const TABS: TabItem[] = [
  { id: "overview", label: "Обзор", icon: IconOverview },
  { id: "processes", label: "Процессы", icon: IconProcesses },
  { id: "storage", label: "Накопители", icon: IconStorage },
  { id: "network", label: "Сеть", icon: IconNetwork },
  { id: "widgets", label: "Виджеты", icon: IconWidgets },
  { id: "settings", label: "Настройки", icon: IconSettings },
];

interface SidebarProps {
  tab: Tab;
  onChange: (tab: Tab) => void;
  snapshot: Snapshot | null;
}

export function Sidebar({ tab, onChange, snapshot }: SidebarProps) {
  const cpu = snapshot?.cpu.total ?? 0;
  const memory =
    snapshot && snapshot.memory.total > 0
      ? (snapshot.memory.used / snapshot.memory.total) * 100
      : 0;

  return (
    <aside className="sidebar">
      <nav className="nav">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={`nav-item${tab === id ? " is-active" : ""}`}
            onClick={() => onChange(id)}
          >
            <Icon />
            <span className="nav-label">{label}</span>
            {id === "processes" && snapshot ? (
              <span className="nav-badge">{snapshot.processCount}</span>
            ) : null}
          </button>
        ))}
      </nav>

      <div className="sidebar-stats">
        <div className="mini-stat">
          <div className="mini-stat-head">
            <span>CPU</span>
            <span>{Math.round(cpu)}%</span>
          </div>
          <div className="mini-bar">
            <div style={{ width: `${Math.min(100, cpu)}%` }} />
          </div>
        </div>

        <div className="mini-stat">
          <div className="mini-stat-head">
            <span>RAM</span>
            <span>{Math.round(memory)}%</span>
          </div>
          <div className="mini-bar">
            <div style={{ width: `${Math.min(100, memory)}%` }} />
          </div>
        </div>

        <div className="sidebar-foot">
          <span className="live-dot" />
          <span className="truncate">{snapshot?.hostname ?? "подключение…"}</span>
        </div>
      </div>
    </aside>
  );
}
