import type { AppAlert } from "../hooks/useMetrics";

interface AlertStackProps {
  alerts: AppAlert[];
  onDismiss: (id: number) => void;
}

export function AlertStack({ alerts, onDismiss }: AlertStackProps) {
  if (alerts.length === 0) return null;

  return (
    <div className="alerts" role="status" aria-live="polite">
      {alerts.map((alert) => (
        <div key={alert.id} className={`alert alert-${alert.kind}`}>
          <span className="alert-dot" />
          <span className="alert-text">{alert.text}</span>
          <button
            type="button"
            className="alert-close"
            title="Скрыть"
            onClick={() => onDismiss(alert.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
