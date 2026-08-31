"use client";

import { cn } from "@/lib/utils";
// Sembol tablosu TEK KAYNAK: lib/tenders/labels.ts (Dalga B-2) — buradaki
// kopya CHF/AED'de labels.ts ile ÇELİŞİYORDU (aynı tutar iki ekranda iki sembol).
import { currencySymbol } from "@/lib/tenders/labels";

/**
 * P1 (frontend denetimi §8.1) — TEK para gösterimi. Kurallar:
 *  - Intl tr-TR, kuruş HER YERDE var (gizlenmez; istenirse küçültülür),
 *  - sembol DAİMA sonda, font-mono + tabular-nums,
 *  - 0 değeri nötr gri (sıfıra amber/yeşil boyamak yasak).
 * Görülen 6 farklı format (₺206.000 / 42.119,9 ₺ / 2.231 ₺ / …) bu bileşende
 * teke iner; yeni para gösterimleri BURADAN geçer, elden formatlanmaz.
 */
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
  return `${num} ${currencySymbol(currency)}`;
}

/**
 * Faz 4 — KPI kartları için kısaltılmış tutar: "208,2 B ₺", "1,2 Mn ₺".
 * 10.000 altı kısaltılmaz (kuruşsuz tam sayı). Tam değer çağıran tarafta
 * title/tooltip olarak verilir (formatMoney ile).
 */
export function formatCompactMoney(
  value: number | string,
  currency = "TRY",
): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  const sym = currencySymbol(currency);
  if (Math.abs(n) < 10_000) {
    return `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(n)} ${sym}`;
  }
  const num = new Intl.NumberFormat("tr-TR", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
  return `${num} ${sym}`;
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
  const sym = currencySymbol(currency);
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
