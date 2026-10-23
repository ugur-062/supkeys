"use client";

import type { Locale } from "@rothern/i18n";
import { useLocale } from "next-intl";
import { countryDisplayName, useScopeLabel } from "@/i18n/domain";
import { cn } from "@/lib/utils";
import { ScopeFlags } from "./target-scope";

/**
 * Satırların "Görünürlük" çipi. Hedef ülkeli talepte bayrak(lar) + ad (son
 * toparlama 2026-10-04: kapsam bayrakla okunur; tüm ülkelere açık talep
 * yeşil çip, ikon yok). Dar sütunda çip hücreyi aşmaz: ad kısalır, tam liste
 * ipucunda.
 */
export function ScopeChip({
  targetCountries,
  ownerCountry,
  className,
}: {
  targetCountries: readonly string[] | null | undefined;
  ownerCountry?: string | null;
  className?: string;
}) {
  const scopeLabel = useScopeLabel();
  const locale = useLocale() as Locale;
  const list = targetCountries ?? [];
  const open = list.length === 0;
  return (
    <span
      // İpucunda ülke ADLARI (2026-10-04): ham ISO kodu ("DE, AZ, TR") okunmuyordu.
      // Tüm ülkelere açık çipte ipucu etiketin kendisi: 1280 px'te sütun dar
      // kalınca "Tüm ülk…" diye kısalıyor, tam metin okunamıyordu (2026-10-07).
      title={open ? scopeLabel(list, ownerCountry) : list.map((c) => countryDisplayName(c, locale)).join(", ")}
      className={cn(
        "inline-flex min-w-0 max-w-full items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold ring-1",
        open ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-slate-50 text-slate-600 ring-slate-200",
        className,
      )}
    >
      {open ? null : <ScopeFlags codes={list} max={2} />}
      <span className="min-w-0 truncate">{scopeLabel(list, ownerCountry)}</span>
    </span>
  );
}
