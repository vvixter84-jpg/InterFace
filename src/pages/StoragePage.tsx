import { LoadingState } from "../components/LoadingState";
import { Meter } from "../components/Meter";
import { bytes, percent, plural } from "../lib/format";
import type { Snapshot } from "../types";

interface StoragePageProps {
  snapshot: Snapshot | null;
}

export function StoragePage({ snapshot }: StoragePageProps) {
  if (!snapshot) return <LoadingState />;

  const { disks } = snapshot;
  const total = disks.reduce((sum, disk) => sum + disk.total, 0);
  const free = disks.reduce((sum, disk) => sum + disk.available, 0);
  const used = total - free;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">Хранилище</div>
          <h1>Накопители</h1>
        </div>
        <div className="head-meta">
          <span>{plural(disks.length, "том", "тома", "томов")}</span>
          <span className="meta-dot" />
          <span>занято {bytes(used)}</span>
        </div>
      </header>

      <section className="summary-row">
        <div className="summary-cell">
          <span className="summary-label">Общий объём</span>
          <span className="summary-value">{bytes(total)}</span>
        </div>
        <div className="summary-cell">
          <span className="summary-label">Занято</span>
          <span className="summary-value">{bytes(used)}</span>
        </div>
        <div className="summary-cell">
          <span className="summary-label">Свободно</span>
          <span className="summary-value">{bytes(free)}</span>
        </div>
        <div className="summary-cell">
          <span className="summary-label">Заполнение</span>
          <span className="summary-value">{Math.round(percent(used, total))}%</span>
        </div>
      </section>

      <section className="disk-cards">
        {disks.map((disk) => {
          const diskUsed = disk.total - disk.available;
          const usedPercent = percent(diskUsed, disk.total);
          const isSystem = disk.mount.toUpperCase().startsWith("C:");

          return (
            <article key={disk.mount} className="card disk-card">
              <header className="disk-card-head">
                <div>
                  <div className="disk-card-mount">
                    {disk.mount}
                    {isSystem ? <span className="tag">система</span> : null}
                    {disk.removable ? <span className="tag tag-muted">съёмный</span> : null}
                  </div>
                  <div className="disk-card-name truncate">{disk.name || "Без имени"}</div>
                </div>
                <div className="disk-card-percent">{Math.round(usedPercent)}%</div>
              </header>

              <Meter value={usedPercent} height={6} />

              <div className="disk-card-stats">
                <div>
                  <span className="summary-label">Занято</span>
                  <span className="mono">{bytes(diskUsed)}</span>
                </div>
                <div>
                  <span className="summary-label">Свободно</span>
                  <span className="mono">{bytes(disk.available)}</span>
                </div>
                <div>
                  <span className="summary-label">Всего</span>
                  <span className="mono">{bytes(disk.total)}</span>
                </div>
                <div>
                  <span className="summary-label">ФС</span>
                  <span className="mono">{disk.fileSystem || "—"}</span>
                </div>
                <div>
                  <span className="summary-label">Тип</span>
                  <span className="mono">{disk.kind || "неизвестен"}</span>
                </div>
              </div>
            </article>
          );
        })}
      </section>

      {disks.length === 0 ? (
        <div className="table-empty">Накопители не обнаружены.</div>
      ) : null}
    </div>
  );
}
