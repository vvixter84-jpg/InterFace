interface LoadingStateProps {
  title?: string;
  hint?: string;
}

export function LoadingState({
  title = "Собираю первый замер…",
  hint = "Данные приходят раз в секунду из системного потока",
}: LoadingStateProps) {
  return (
    <div className="state-screen">
      <div className="spinner" />
      <p className="state-title">{title}</p>
      <p className="state-hint">{hint}</p>
    </div>
  );
}
