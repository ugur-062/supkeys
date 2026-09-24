"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatNumber } from "@/i18n/format";
import { cn } from "@/lib/utils";

interface Props {
  total: number;
  isFiltered: boolean;
  unit?: string;
  className?: string;
  /** B6: veri henüz yüklenmediyse "0 satın alma talebi" basma — küçük skeleton göster. */
  isLoading?: boolean;
}

export function ResultCount({
  total,
  isFiltered,
  unit,
  className,
  isLoading = false,
}: Props) {
  const t = useTranslations("web.panel.shell.resultCount");
  const locale = useLocale();
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
      <strong className="text-zinc-900 font-semibold">
        {formatNumber(total, locale)}
      </strong>{" "}
      {unit ?? t("sonuc")}
      {isFiltered ? (
        <span className="text-slate-400 ml-1">{t("filtrelenmis")}</span>
      ) : null}
    </p>
  );
}
