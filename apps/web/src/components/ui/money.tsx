"use client";

import { cn } from "@/lib/utils";

/**
 * P1 (frontend denetimi §8.1) — TEK para gösterimi. Kurallar:
 *  - Intl tr-TR, kuruş HER YERDE var (gizlenmez; istenirse küçültülür),
 *  - sembol DAİMA sonda, font-mono + tabular-nums,
 *  - 0 değeri nötr gri (sıfıra amber/yeşil boyamak yasak).
 * Görülen 6 farklı format (₺206.000 / 42.119,9 ₺ / 2.231 ₺ / …) bu bileşende
 * teke iner; yeni para gösterimleri BURADAN geçer, elden formatlanmaz.
 */
const SYMBOL: Record<string, string> = {
  TRY: "₺",
  USD: "$",
  EUR: "€",
  GBP: "£",
  CHF: "CHF",
  JPY: "¥",
  AED: "AED",
  CNY: "¥",
  RUB: "₽",
};

export function formatMoney(
  value: number | string,
  currency = "TRY",
): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  const num = new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
  return `${num} ${SYMBOL[currency] ?? currency}`;
}

export function Money({
  value,
  currency = "TRY",
  className,
  /** Büyük rakamlarda kuruş küçültülür ama GİZLENMEZ. */
  shrinkFraction = false,
}: {
  value: number | string;
  currency?: string;
  className?: string;
  shrinkFraction?: boolean;
}) {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) {
    return <span className={cn("font-mono tabular-nums", className)}>—</span>;
  }
  const [int, frac] = new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .format(n)
    .split(",");
  const sym = SYMBOL[currency] ?? currency;
  return (
    <span
      className={cn(
        "font-mono tabular-nums",
        n === 0 && "text-zinc-400",
        className,
      )}
    >
      {int}
      <span className={shrinkFraction ? "text-[0.72em] text-zinc-400" : undefined}>
        ,{frac}
      </span>{" "}
      {sym}
    </span>
  );
}
