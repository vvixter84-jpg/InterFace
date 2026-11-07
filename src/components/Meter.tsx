interface MeterProps {
  value: number;
  tone?: "accent" | "warn" | "danger";
  height?: number;
}

export function Meter({ value, tone = "accent", height }: MeterProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const auto = clamped >= 90 ? "danger" : clamped >= 75 ? "warn" : tone;

  return (
    <div className={`meter meter-${auto}`} style={height ? { height } : undefined}>
      <div className="meter-fill" style={{ width: `${clamped}%` }} />
    </div>
  );
}
