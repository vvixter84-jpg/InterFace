import { Gauge } from "../components/Gauge";
import { LoadingState } from "../components/LoadingState";
import { Meter } from "../components/Meter";
import { Sparkline } from "../components/Sparkline";
import { IconArrowDown, IconArrowUp, IconBattery } from "../components/icons";
import { bytes, clockTime, frequency, percent, plural, rate, uptime } from "../lib/format";
import type { HistoryPoint, Snapshot } from "../types";

interface OverviewPageProps {
  snapshot: Snapshot | null;
  history: HistoryPoint[];
  onOpenProcesses: () => void;
}

export function OverviewPage({ snapshot, history, onOpenProcesses }: OverviewPageProps) {
  if (!snapshot) return <LoadingState />;

  const { cpu, memory, networks, disks, battery, top } = snapshot;
  const memoryPercent = percent(memory.used, memory.total);
  const rx = networks.reduce((sum, item) => sum + item.rxRate, 0);
  const tx = networks.reduce((sum, item) => sum + item.txRate, 0);
  const diskTotal = disks.reduce((sum, disk) => sum + disk.total, 0);
  const diskFree = disks.reduce((sum, disk) => sum + disk.available, 0);
  const swapPercent = percent(memory.swapUsed, memory.swapTotal);

  const cpuSeries = history.map((point) => point.cpu);
  const rxSeries = history.map((point) => point.rx);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">Обзор системы</div>
          <h1>{snapshot.hostname}</h1>
        </div>
        <div className="head-meta">
          {battery ? (
            <span className="battery-chip">
              <IconBattery />
              {battery.percent}%
              {battery.charging ? " · заряжается" : ""}
            </span>
          ) : null}
          <span>
            {snapshot.osName} {snapshot.osVersion}
          </span>
          <span className="meta-dot" />
          <span>работает {uptime(snapshot.uptime)}</span>
          <span className="meta-dot" />
          <span className="mono">{clockTime(snapshot.ts)}</span>
        </div>
      </header>

      <section className="grid">
        <article className="card card-cpu">
          <header className="card-head">
            <span className="card-title">Процессор</span>
            <span className="card-meta truncate" title={cpu.brand}>
              {cpu.brand} · {frequency(cpu.frequency)}
            </span>
          </header>

          <div className="cpu-layout">
            <Gauge value={cpu.total} size={158} />

            <div className="cpu-side">
              <div className="cpu-caption">
                <span>
                  {cpu.cores} ядер · {cpu.threads} потоков
                </span>
                <span className="mono">пик ядра {Math.round(Math.max(0, ...cpu.perCore))}%</span>
              </div>

              <Sparkline values={cpuSeries} max={100} height={64} />

              <div className="core-grid" aria-hidden="true">
                {cpu.perCore.slice(0, 32).map((value, index) => (
                  <div key={index} className="core-cell">
                    <div
                      className="core-fill"
                      style={{ height: `${Math.max(4, Math.min(100, value))}%` }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </article>

        <article className="card card-memory">
          <header className="card-head">
            <span className="card-title">Память</span>
            <span className="card-meta">{bytes(memory.available)} свободно</span>
          </header>

          <div className="big-num">{bytes(memory.used)}</div>
          <div className="num-hint">
            из {bytes(memory.total)} · занято {Math.round(memoryPercent)}%
          </div>

          <Meter value={memoryPercent} />

          <div className="memory-legend">
            <span>
              <span className="legend-dot legend-used" /> занято {bytes(memory.used)}
            </span>
            <span>
              <span className="legend-dot legend-free" /> свободно {bytes(memory.available)}
            </span>
          </div>

          <div className="card-divider" />

          <div className="kv-row">
            <span>Файл подкачки</span>
            <span className="mono">
              {memory.swapTotal > 0
                ? `${bytes(memory.swapUsed)} / ${bytes(memory.swapTotal)}`
                : "не используется"}
            </span>
          </div>
          {memory.swapTotal > 0 ? <Meter value={swapPercent} height={3} /> : null}
        </article>

        <article className="card card-network">
          <header className="card-head">
            <span className="card-title">Сеть</span>
            <span className="card-meta">
              {plural(networks.length, "интерфейс", "интерфейса", "интерфейсов")}
            </span>
          </header>

          <div className="net-rates">
            <div className="net-rate">
              <span className="net-arrow">
                <IconArrowDown />
              </span>
              <div>
                <div className="net-value">{rate(rx)}</div>
                <div className="net-label">входящий поток</div>
              </div>
            </div>

            <div className="net-rate">
              <span className="net-arrow net-arrow-up">
                <IconArrowUp />
              </span>
              <div>
                <div className="net-value">{rate(tx)}</div>
                <div className="net-label">исходящий поток</div>
              </div>
            </div>
          </div>

          <Sparkline values={rxSeries} height={52} />

          <div className="net-list">
            {networks.slice(0, 3).map((item) => (
              <div key={item.name} className="kv-row">
                <span className="truncate">{item.name}</span>
                <span className="mono">
                  ↓{rate(item.rxRate)} ↑{rate(item.txRate)}
                </span>
              </div>
            ))}
            {networks.length === 0 ? <div className="kv-row">Нет активных интерфейсов</div> : null}
          </div>
        </article>

        <article className="card card-storage">
          <header className="card-head">
            <span className="card-title">Накопители</span>
            <span className="card-meta">
              свободно {bytes(diskFree)} из {bytes(diskTotal)}
            </span>
          </header>

          <div className="disk-list">
            {disks.map((disk) => {
              const used = disk.total - disk.available;
              const usedPercent = percent(used, disk.total);
              return (
                <div key={disk.mount} className="disk-row">
                  <div className="disk-head">
                    <span className="disk-mount">{disk.mount}</span>
                    <span className="disk-name truncate">
                      {disk.name || disk.fileSystem || disk.kind}
                    </span>
                    <span className="disk-value mono">
                      {bytes(used)} / {bytes(disk.total)}
                    </span>
                  </div>
                  <Meter value={usedPercent} height={5} />
                  <div className="disk-foot">
                    <span>свободно {bytes(disk.available)}</span>
                    <span>
                      {[disk.fileSystem, disk.kind].filter(Boolean).join(" · ") || "тип неизвестен"}
                    </span>
                  </div>
                </div>
              );
            })}

            {disks.length === 0 ? <div className="kv-row">Накопители не найдены</div> : null}
          </div>
        </article>

        <article className="card card-processes">
          <header className="card-head">
            <span className="card-title">Нагрузка процессов</span>
            <button type="button" className="link-button" onClick={onOpenProcesses}>
              Все процессы →
            </button>
          </header>

          <table className="table table-compact">
            <thead>
              <tr>
                <th>Процесс</th>
                <th className="num">PID</th>
                <th className="num">CPU</th>
                <th className="num">Память</th>
              </tr>
            </thead>
            <tbody>
              {top.map((process) => (
                <tr key={process.pid} onClick={onOpenProcesses} className="row-action">
                  <td>
                    <span className="proc-name" title={process.exe}>
                      {process.name}
                    </span>
                  </td>
                  <td className="num mono">{process.pid}</td>
                  <td className="num">
                    <span className={`cpu-badge${process.cpu >= 25 ? " is-hot" : ""}`}>
                      {process.cpu.toFixed(1)}%
                    </span>
                  </td>
                  <td className="num mono">{bytes(process.memory)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      </section>
    </div>
  );
}
