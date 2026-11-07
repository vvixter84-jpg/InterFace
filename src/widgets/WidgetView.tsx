import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { Sparkline } from "../components/Sparkline";
import { api } from "../lib/tauri";
import { bytes, frequency, percent, rate, uptime, withAlpha } from "../lib/format";
import type { HistoryPoint, Snapshot, WidgetConfig, WidgetKind } from "../types";

const appWindow = getCurrentWindow();

const TITLES: Record<WidgetKind, string> = {
  cpu: "Процессор",
  memory: "Память",
  network: "Сеть",
  disks: "Накопители",
  processes: "Процессы",
  clock: "Время",
  battery: "Батарея",
  diskio: "Диски: обмен",
  memorytop: "Память: топ",
  calendar: "Календарь",
  cpuactivity: "Активность CPU",
  gpu: "Видеокарта",
};

interface WidgetViewProps {
  kind: WidgetKind;
  config: WidgetConfig;
  snapshot: Snapshot | null;
  accent: string;
  history: HistoryPoint[];
}

export function WidgetView({ kind, config, snapshot, accent, history }: WidgetViewProps) {
  const style = {
    // В непрозрачном режиме фон всё равно должен быть плотным: окно
    // создаётся без прозрачности, но CSS-альфа оставила бы «стекло».
    "--w-alpha": config.transparent ? config.opacity : 1,
    "--w-scale": config.scale,
    "--w-accent": accent,
    "--w-glow": withAlpha(accent, 0.15),
    "--w-glow-faint": withAlpha(accent, 0.05),
  } as CSSProperties;

  return (
    <div
      className={`widget${config.transparent ? " is-glass" : " is-solid"}`}
      style={style}
      data-tauri-drag-region
      // Атрибута мало: он срабатывает только на самом элементе, а дети
      // (заголовок, цифры) перехватывают нажатие. Тянем окно явно.
      onPointerDown={(event) => {
        if (event.button === 0) void appWindow.startDragging();
      }}
      onPointerUp={() => {
        // Клик поднимает окно; чуть позже возвращаем его под обычные окна.
        window.setTimeout(() => {
          void api.restoreWidgetsOrder().catch(() => undefined);
        }, 500);
      }}
    >
      {config.label ? (
        <div className="widget-head">
          <span className="widget-title">{TITLES[kind]}</span>
          <span className="widget-mark" />
        </div>
      ) : null}

      <span className="widget-grip" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
      </span>

      <div className="widget-body">
        {kind === "cpu" ? <CpuBody config={config} snapshot={snapshot} history={history} /> : null}
        {kind === "memory" ? <MemoryBody snapshot={snapshot} /> : null}
        {kind === "network" ? (
          <NetworkBody config={config} snapshot={snapshot} history={history} />
        ) : null}
        {kind === "disks" ? <DisksBody snapshot={snapshot} /> : null}
        {kind === "processes" ? <ProcessesBody snapshot={snapshot} /> : null}
        {kind === "clock" ? <ClockBody snapshot={snapshot} /> : null}
        {kind === "battery" ? <BatteryBody snapshot={snapshot} /> : null}
        {kind === "diskio" ? <DiskIoBody snapshot={snapshot} /> : null}
        {kind === "memorytop" ? <MemoryTopBody snapshot={snapshot} /> : null}
        {kind === "cpuactivity" ? (
          <CpuActivityBody config={config} snapshot={snapshot} history={history} />
        ) : null}
        {kind === "gpu" ? <GpuBody snapshot={snapshot} /> : null}
        {kind === "calendar" ? <CalendarBody /> : null}
      </div>
    </div>
  );
}

function Waiting() {
  return <div className="w-waiting">ожидание данных…</div>;
}

function CpuBody({
  config,
  snapshot,
  history,
}: {
  config: WidgetConfig;
  snapshot: Snapshot | null;
  history: HistoryPoint[];
}) {
  if (!snapshot) return <Waiting />;
  const series = history.map((point) => point.cpu);

  return (
    <>
      <div className="w-row">
        <span className="w-big">
          {Math.round(snapshot.cpu.total)}
          <i>%</i>
        </span>
        <span className="w-sub">{snapshot.cpu.threads} потоков</span>
      </div>

      {config.chart ? <Sparkline values={series} max={100} height={32} /> : null}

      <div className="w-cores">
        {snapshot.cpu.perCore.slice(0, 16).map((value, index) => (
          <span
            key={index}
            className="w-core"
            style={{ height: `${Math.max(8, Math.min(100, value))}%` }}
          />
        ))}
      </div>
    </>
  );
}

function MemoryBody({ snapshot }: { snapshot: Snapshot | null }) {
  if (!snapshot) return <Waiting />;
  const used = percent(snapshot.memory.used, snapshot.memory.total);

  return (
    <>
      <div className="w-row">
        <span className="w-big">
          {Math.round(used)}
          <i>%</i>
        </span>
        <span className="w-sub">{bytes(snapshot.memory.used)}</span>
      </div>
      <div className="w-bar">
        <span style={{ width: `${used}%` }} />
      </div>
      <div className="w-sub">из {bytes(snapshot.memory.total)}</div>
    </>
  );
}

function NetworkBody({
  config,
  snapshot,
  history,
}: {
  config: WidgetConfig;
  snapshot: Snapshot | null;
  history: HistoryPoint[];
}) {
  if (!snapshot) return <Waiting />;
  const rx = snapshot.networks.reduce((sum, item) => sum + item.rxRate, 0);
  const tx = snapshot.networks.reduce((sum, item) => sum + item.txRate, 0);
  const series = history.map((point) => point.rx);

  return (
    <>
      <div className="w-net-row">
        <span className="w-dir">↓</span>
        <span className="w-net">{rate(rx)}</span>
      </div>
      <div className="w-net-row">
        <span className="w-dir w-dir-up">↑</span>
        <span className="w-net">{rate(tx)}</span>
      </div>
      {config.chart ? <Sparkline values={series} height={30} /> : null}
    </>
  );
}

function DisksBody({ snapshot }: { snapshot: Snapshot | null }) {
  if (!snapshot) return <Waiting />;

  return (
    <>
      {snapshot.disks.slice(0, 3).map((disk) => {
        const used = percent(disk.total - disk.available, disk.total);
        return (
          <div key={disk.mount} className="w-disk">
            <div className="w-disk-head">
              <span>{disk.mount}</span>
              <span className="w-disk-free">{bytes(disk.available)} свободно</span>
            </div>
            <div className="w-bar">
              <span style={{ width: `${used}%` }} />
            </div>
          </div>
        );
      })}
      {snapshot.disks.length === 0 ? <Waiting /> : null}
    </>
  );
}

function ProcessesBody({ snapshot }: { snapshot: Snapshot | null }) {
  if (!snapshot) return <Waiting />;

  return (
    <>
      {snapshot.top.slice(0, 3).map((process) => (
        <div key={process.pid} className="w-proc">
          <span className="truncate">{process.name}</span>
          <span className="w-proc-cpu">{process.cpu.toFixed(1)}%</span>
        </div>
      ))}
    </>
  );
}

function ClockBody({ snapshot }: { snapshot: Snapshot | null }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const date = now.toLocaleDateString("ru-RU", {
    weekday: "short",
    day: "2-digit",
    month: "long",
  });

  return (
    <>
      <div className="w-clock">
        {now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
      </div>
      <div className="w-sub w-capitalize">{date}</div>
      {snapshot ? <div className="w-sub">в сети {uptime(snapshot.uptime)}</div> : null}
    </>
  );
}

function BatteryBody({ snapshot }: { snapshot: Snapshot | null }) {
  if (!snapshot) return <Waiting />;
  const battery = snapshot.battery;
  if (!battery) return <div className="w-waiting">нет батареи</div>;

  return (
    <>
      <div className="w-row">
        <span className="w-big">
          {battery.percent}
          <i>%</i>
        </span>
        <span className="w-sub">
          {battery.charging ? "заряжается" : battery.acOnline ? "от сети" : "от батареи"}
        </span>
      </div>
      <div className="w-bar">
        <span style={{ width: `${battery.percent}%` }} />
      </div>
      {battery.secondsLeft ? (
        <div className="w-sub">осталось {uptime(battery.secondsLeft)}</div>
      ) : null}
    </>
  );
}

function DiskIoBody({ snapshot }: { snapshot: Snapshot | null }) {
  if (!snapshot) return <Waiting />;
  const ceiling = 50 * 1024 * 1024;

  return (
    <>
      {snapshot.disks.slice(0, 3).map((disk) => (
        <div key={disk.mount} className="w-disk">
          <div className="w-disk-head">
            <span>{disk.mount}</span>
            <span className="w-disk-free mono">
              ↓{rate(disk.readRate)} ↑{rate(disk.writeRate)}
            </span>
          </div>
          <div className="w-bar">
            <span
              style={{
                width: `${Math.min(100, ((disk.readRate + disk.writeRate) / ceiling) * 100)}%`,
              }}
            />
          </div>
        </div>
      ))}
      {snapshot.disks.length === 0 ? <Waiting /> : null}
    </>
  );
}

function MemoryTopBody({ snapshot }: { snapshot: Snapshot | null }) {
  if (!snapshot) return <Waiting />;

  return (
    <>
      {snapshot.topMemory.map((process) => (
        <div key={process.pid} className="w-proc">
          <span className="truncate">{process.name}</span>
          <span className="w-proc-cpu">{bytes(process.memory)}</span>
        </div>
      ))}
      {snapshot.topMemory.length === 0 ? <Waiting /> : null}
    </>
  );
}

function CpuActivityBody({
  config,
  snapshot,
  history,
}: {
  config: WidgetConfig;
  snapshot: Snapshot | null;
  history: HistoryPoint[];
}) {
  if (!snapshot) return <Waiting />;
  const series = history.map((point) => point.cpu);
  const peak = snapshot.cpu.perCore.length
    ? Math.round(Math.max(...snapshot.cpu.perCore))
    : 0;

  return (
    <>
      <div className="w-row">
        <span className="w-big">
          {Math.round(snapshot.cpu.total)}
          <i>%</i>
        </span>
        <span className="w-sub">{frequency(snapshot.cpu.frequency)}</span>
      </div>
      {config.chart ? <Sparkline values={series} max={100} height={42} /> : null}
      <div className="w-sub">
        пик ядра {peak}% · {snapshot.cpu.threads} потоков
      </div>
    </>
  );
}

function GpuBody({ snapshot }: { snapshot: Snapshot | null }) {
  if (!snapshot) return <Waiting />;
  const gpu = snapshot.gpu;
  if (!gpu) return <div className="w-waiting">нет данных (нужен драйвер NVIDIA)</div>;

  const vram = percent(gpu.memoryUsed, gpu.memoryTotal);

  return (
    <>
      <div className="w-row">
        <span className="w-big">
          {gpu.utilization}
          <i>%</i>
        </span>
        <span className="w-sub">{gpu.temperature}°C</span>
      </div>
      <div className="w-bar">
        <span style={{ width: `${vram}%` }} />
      </div>
      <div className="w-sub truncate">{gpu.name}</div>
      <div className="w-sub">
        {bytes(gpu.memoryUsed)} / {bytes(gpu.memoryTotal)}
      </div>
    </>
  );
}

const WEEKDAYS = ["П", "В", "С", "Ч", "П", "С", "В"];

function CalendarBody() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells: Array<number | null> = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: days }, (_, index) => index + 1),
  ];
  const title = today.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });

  return (
    <>
      <div className="w-cal-title w-capitalize">{title}</div>
      <div className="w-cal">
        {WEEKDAYS.map((day, index) => (
          <span key={`h${index}`} className="w-cal-week">
            {day}
          </span>
        ))}
        {cells.map((day, index) => (
          <span
            key={index}
            className={`w-cal-day${day === today.getDate() ? " is-today" : ""}`}
          >
            {day ?? ""}
          </span>
        ))}
      </div>
    </>
  );
}
