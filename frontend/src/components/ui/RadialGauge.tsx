interface RadialGaugeProps {
  percent: number | null;
  label: string;
  colorClass: string;
  size?: number;
}

export function RadialGauge({ percent, label, colorClass, size = 128 }: RadialGaugeProps) {
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  const value = percent ?? 0;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg className="h-full w-full -rotate-90">
        <circle className="text-surface-variant" cx={size / 2} cy={size / 2} fill="none" r={radius} stroke="currentColor" strokeWidth="8" />
        {percent !== null && (
          <circle
            className={`${colorClass} transition-all duration-1000 ease-out`}
            cx={size / 2}
            cy={size / 2}
            fill="none"
            r={radius}
            stroke="currentColor"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            strokeWidth="8"
          />
        )}
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-headline-lg font-semibold text-on-surface">{percent !== null ? `${percent}%` : "—"}</span>
        <span className="font-mono text-[10px] uppercase text-on-surface-variant">{label}</span>
      </div>
    </div>
  );
}
