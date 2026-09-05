/**
 * İlerleme halkası (SVG, bağımlılık yok) — profil tamlığı gibi 0-100 değer.
 * Renk: tamamsa yeşil, 60+ mavi, altı amber (uyarı) — ama vurgu metinde,
 * halka sakin.
 */
export function ProgressRing({
  value,
  size = 72,
  stroke = 7,
  label,
  className,
}: {
  value: number;
  size?: number;
  stroke?: number;
  /** Ortadaki metin (varsayılan "%value"). */
  label?: string;
  className?: string;
}) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (v / 100) * c;
  const tone = v >= 100 ? "#059669" : v >= 60 ? "#2563eb" : "#d97706";
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={v}
      aria-label={label ?? `%${v}`}
      className={className}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e4e4e7" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fontSize={size * 0.24} fontWeight={600} fill="#09090b">
          {label ?? `%${v}`}
        </text>
      </svg>
    </div>
  );
}
