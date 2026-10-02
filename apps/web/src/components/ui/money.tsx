"use client";

import type { Locale } from "@rothern/i18n";
import { useLocale } from "next-intl";
import { cn } from "@/lib/utils";
import { intlLocale } from "@/i18n/format";
// Sembol tablosu TEK KAYNAK: lib/tenders/labels.ts (Dalga B-2) — buradaki
// kopya CHF/AED'de labels.ts ile ÇELİŞİYORDU (aynı tutar iki ekranda iki sembol).
import { affixCurrency, currencySymbol } from "@/lib/tenders/labels";

/**
 * P1 (frontend denetimi §8.1) — TEK para gösterimi. Kurallar:
 *  - sayı ARAYÜZ DİLİNİN biçimiyle (2026-09-27; önce tr-TR sabitti → İngilizce
 *    arayüzde "1.234,56 $"), kuruş HER YERDE var (gizlenmez; istenirse küçültülür),
 *  - sembolün YERİ dilden (`affixCurrency`: İngilizcede önde "$1,234.56",
 *    Türkçe/Rusçada sonda "1.234,56 ₺"; 2026-09-27), tabular-nums,
 *  - 0 değeri nötr gri (sıfıra amber/yeşil boyamak yasak).
 * Görülen 6 farklı format (₺206.000 / 42.119,9 ₺ / 2.231 ₺ / …) bu bileşende
 * teke iner; yeni para gösterimleri BURADAN geçer, elden formatlanmaz.
 * Bileşende `useFormatMoney()`; dil ZORUNLU parametre (unutulamasın).
 */
export function formatMoney(
  value: number | string,
  currency: string,
  locale: Locale | string,
): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  const num = new Intl.NumberFormat(intlLocale(locale), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
  return affixCurrency(num, currency, locale);
}

/**
 * Faz 4 — KPI kartları için kısaltılmış tutar: TR "208,2 B ₺", EN "₺208.2K",
 * RU "208,2 тыс. ₺". Kısaltma harfi DİLİN kısaltmasıdır: tr-TR sabitken
 * İngilizce okur "B"yi billion sanıyordu (Türkçede bin). 10.000 altı
 * kısaltılmaz (kuruşsuz tam sayı). Tam değer çağıran tarafta title/tooltip
 * olarak verilir (formatMoney ile).
 */
export function formatCompactMoney(
  value: number | string,
  currency: string,
  locale: Locale | string,
): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  const intl = intlLocale(locale);
  if (Math.abs(n) < 10_000) {
    return affixCurrency(new Intl.NumberFormat(intl, { maximumFractionDigits: 0 }).format(n), currency, locale);
  }
  const num = new Intl.NumberFormat(intl, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
  return affixCurrency(num, currency, locale);
}

/**
 * Grafik tutar EKSENİ etiketi: bir eksen TEK gösterim kullanır. Gösterimi tek
 * tek tik değeri değil eksenin ÖLÇEĞİ (`scaleMax` = serideki en büyük mutlak
 * değer) seçer: 10.000 ve üstü ölçekte HER tik kısaltılır ("0 ₺, 9 B ₺, 18 B ₺"),
 * altında hepsi kuruşsuz tam yazılır. Tik başına `formatCompactMoney`
 * kullanılınca aynı eksende "9.000 ₺" ile "18 B ₺" yan yana çıkıyordu
 * (arayüz testi son tur, Nakit Takvimi).
 */
export function formatAxisMoney(
  value: number | string,
  currency: string,
  locale: Locale | string,
  scaleMax: number,
): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  const intl = intlLocale(locale);
  const compact = Number.isFinite(scaleMax) && Math.abs(scaleMax) >= 10_000;
  const num = new Intl.NumberFormat(
    intl,
    compact ? { notation: "compact", maximumFractionDigits: 1 } : { maximumFractionDigits: 0 },
  ).format(n);
  return affixCurrency(num, currency, locale);
}

/** Bir serinin eksen ölçeği: değerlerin en büyük mutlak değeri (boşsa 0). */
export function axisScaleMax(values: ReadonlyArray<number | null | undefined>): number {
  let max = 0;
  for (const v of values) {
    const a = Math.abs(Number(v ?? 0));
    if (Number.isFinite(a) && a > max) max = a;
  }
  return max;
}

/** Arayüz diline bağlı para biçimleyiciler (`formatMoney`/`formatCompactMoney`/`formatAxisMoney`). */
export function useFormatMoney(): {
  money: (value: number | string, currency?: string | null) => string;
  compact: (value: number | string, currency?: string | null) => string;
  axis: (value: number | string, currency: string | null | undefined, scaleMax: number) => string;
} {
  const locale = useLocale();
  return {
    money: (value, currency) => formatMoney(value, currency ?? "TRY", locale),
    compact: (value, currency) => formatCompactMoney(value, currency ?? "TRY", locale),
    axis: (value, currency, scaleMax) => formatAxisMoney(value, currency ?? "TRY", locale, scaleMax),
  };
}

/**
 * Tam sayı + ondalık ayracı + kuruş parçaları (dilin ayracıyla). Kuruş ayrı
 * `<span>`de küçültülebilsin diye; ayraç dilden gelir (EN ".", TR/RU ",").
 */
export function moneyParts(n: number, locale: Locale | string): { int: string; decimal: string; frac: string } {
  const parts = new Intl.NumberFormat(intlLocale(locale), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).formatToParts(n);
  const at = parts.findIndex((p) => p.type === "decimal");
  if (at === -1) return { int: parts.map((p) => p.value).join(""), decimal: "", frac: "" };
  return {
    int: parts.slice(0, at).map((p) => p.value).join(""),
    decimal: parts[at]!.value,
    frac: parts.slice(at + 1).map((p) => p.value).join(""),
  };
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
  const locale = useLocale();
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) {
    return <span className={cn(" tabular-nums", className)}>—</span>;
  }
  const { int, decimal, frac } = moneyParts(n, locale);
  const sym = currencySymbol(currency);
  // Sembolün yeri dilden (`affixCurrency` ile aynı kural): İngilizcede önde.
  const lead = String(locale).startsWith("en");
  const gap = /^[A-Za-z]+$/.test(sym) ? " " : "";
  const neg = int.startsWith("-") || int.startsWith("−");
  return (
    <span
      className={cn(
        " tabular-nums",
        n === 0 && "text-zinc-400",
        className,
      )}
    >
      {lead ? `${neg ? "-" : ""}${sym}${gap}` : null}
      {lead && neg ? int.slice(1) : int}
      <span className={shrinkFraction ? "text-[0.72em] text-zinc-400" : undefined}>
        {decimal}
        {frac}
      </span>
      {lead ? null : ` ${sym}`}
    </span>
  );
}
