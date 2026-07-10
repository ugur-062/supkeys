"use client";

/**
 * Ortak istatistik kartı — özet sayaçları için tek görünüm
 * (uyelik-raporu TotalCard + firma özeti StatCard tekleşti).
 */
export function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  /** Vurgulu değer rengi (ör. satış toplamı yeşil). */
  accent?: "emerald";
}) {
  return (
    <div className="admin-card px-4 py-3">
      <p className="text-admin-text-muted text-xs font-medium">{label}</p>
      <p
        className={`mt-1 text-2xl font-bold tabular-nums ${
          accent === "emerald" ? "text-emerald-700" : "text-admin-text"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
