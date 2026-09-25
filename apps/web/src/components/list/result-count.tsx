"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * Sayılan şey. Sayı ile ad AYNI ICU mesajında (`{n, plural, …}`) — ayrı
 * çevrilmiş bir çoğul ad sayının yanına yapıştırılınca EN "1 orders", RU
 * "1 заказов" çıkıyordu.
 */
export type ResultCountKind = "sonuc" | "teklif" | "siparis" | "satinAlmaTalebi";

interface Props {
  total: number;
  isFiltered: boolean;
  kind?: ResultCountKind;
  className?: string;
  /** B6: veri henüz yüklenmediyse "0 satın alma talebi" basma — küçük skeleton göster. */
  isLoading?: boolean;
}

export function ResultCount({
  total,
  isFiltered,
  kind = "sonuc",
  className,
  isLoading = false,
}: Props) {
  const t = useTranslations("web.panel.shell.resultCount");
  if (isLoading) {
    return (
      <span
        aria-hidden
        className={cn(
          "h-4 w-16 animate-pulse rounded bg-slate-200/80",
          className,
        )}
      />
    );
  }
  return (
    <p className={cn("text-sm text-slate-500", className)}>
      {t.rich(kind, {
        n: total,
        b: (chunks) => <strong className="text-zinc-900 font-semibold">{chunks}</strong>,
      })}
      {isFiltered ? (
        <span className="text-slate-400 ml-1">{t("filtrelenmis")}</span>
      ) : null}
    </p>
  );
}
