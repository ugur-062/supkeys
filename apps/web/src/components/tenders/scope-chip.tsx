import { cn } from "@/lib/utils";
import { scopeLabel } from "@rothern/shared";

/**
 * GÖRÜNÜRLÜK ÜLKESİ ÇİPİ (2026-09-21): "Tüm ülkeler" · "Yalnız Türkiye" ·
 * "Türkiye, Almanya" · "Türkiye +3 ülke". Eski Yurtiçi/Uluslararası çipinin
 * yerini alır; renk anlam taşımaz (herkes = açık yeşil, sınırlı = gri).
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
  const list = targetCountries ?? [];
  const open = list.length === 0;
  return (
    <span
      title={list.length > 2 ? list.join(", ") : undefined}
      className={cn(
        "inline-flex rounded px-1.5 py-0.5 text-[11px] font-semibold ring-1",
        open ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-slate-50 text-slate-600 ring-slate-200",
        className,
      )}
    >
      {scopeLabel(list, ownerCountry)}
    </span>
  );
}
