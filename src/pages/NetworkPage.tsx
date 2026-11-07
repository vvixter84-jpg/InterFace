import { LoadingState } from "../components/LoadingState";
import { IconArrowDown, IconArrowUp } from "../components/icons";
import { bytes, plural, rate } from "../lib/format";
import type { Snapshot } from "../types";

interface NetworkPageProps {
  snapshot: Snapshot | null;
}

export function NetworkPage({ snapshot }: NetworkPageProps) {
  if (!snapshot) return <LoadingState />;

  const { networks } = snapshot;
  const rx = networks.reduce((sum, item) => sum + item.rxRate, 0);
  const tx = networks.reduce((sum, item) => sum + item.txRate, 0);
  const totalRx = networks.reduce((sum, item) => sum + item.totalRx, 0);
  const totalTx = networks.reduce((sum, item) => sum + item.totalTx, 0);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">Трафик</div>
          <h1>Сеть</h1>
        </div>
        <div className="head-meta">
          <span>{plural(networks.length, "интерфейс", "интерфейса", "интерфейсов")}</span>
          <span className="meta-dot" />
          <span>с момента запуска {bytes(totalRx + totalTx)}</span>
        </div>
      </header>

      <section className="summary-row">
        <div className="summary-cell">
          <span className="summary-label">
            <IconArrowDown /> Приём
          </span>
          <span className="summary-value">{rate(rx)}</span>
        </div>
        <div className="summary-cell">
          <span className="summary-label">
            <IconArrowUp /> Отдача
          </span>
          <span className="summary-value">{rate(tx)}</span>
        </div>
        <div className="summary-cell">
          <span className="summary-label">Всего принято</span>
          <span className="summary-value">{bytes(totalRx)}</span>
        </div>
        <div className="summary-cell">
          <span className="summary-label">Всего отдано</span>
          <span className="summary-value">{bytes(totalTx)}</span>
        </div>
      </section>

      <div className="table-shell">
        <table className="table">
          <thead>
            <tr>
              <th>Интерфейс</th>
              <th className="num">Приём</th>
              <th className="num">Отдача</th>
              <th className="num">Всего принято</th>
              <th className="num">Всего отдано</th>
            </tr>
          </thead>
          <tbody>
            {networks.map((item) => (
              <tr key={item.name}>
                <td>
                  <span className="proc-name">{item.name}</span>
                </td>
                <td className="num mono">{rate(item.rxRate)}</td>
                <td className="num mono">{rate(item.txRate)}</td>
                <td className="num mono">{bytes(item.totalRx)}</td>
                <td className="num mono">{bytes(item.totalTx)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {networks.length === 0 ? (
          <div className="table-empty">Активные интерфейсы не найдены.</div>
        ) : null}
      </div>

      <p className="footnote">
        Скорости считаются по приращению счётчиков адаптеров между замерами. Виртуальные
        интерфейсы (VPN, Hyper-V, WSL) учитываются отдельными строками.
      </p>
    </div>
  );
}
