import { useId } from "react";

interface SparklineProps {
  values: number[];
  max?: number;
  height?: number;
  color?: string;
  fill?: boolean;
}

/**
 * Мини-график без сторонних библиотек: viewBox растягивается по ширине карточки,
 * толщина линии компенсируется vector-effect, поэтому она не «плывёт».
 */
export function Sparkline({
  values,
  max,
  height = 56,
  color = "currentColor",
  fill = true,
}: SparklineProps) {
  const gradientId = `spark-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const data = values.length >= 2 ? values : [0, 0];
  const ceiling = Math.max(max ?? 0, ...data, 1);
  const step = 100 / (data.length - 1);

  const points = data.map((value, index) => {
    const normalized = Math.max(0, Math.min(1, value / ceiling));
    return `${(index * step).toFixed(2)},${(100 - normalized * 100).toFixed(2)}`;
  });

  const line = `M${points.join(" L")}`;
  const area = `${line} L100,100 L0,100 Z`;

  return (
    <svg
      className="sparkline"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{ height }}
      aria-hidden="true"
    >
      {fill ? (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.22} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gradientId})`} />
        </>
      ) : null}
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
