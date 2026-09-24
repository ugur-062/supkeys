"use client";

import { useLocale, useTranslations } from "next-intl";
import { useSatisAnalytics } from "@/hooks/use-company-dashboard";
import { numberPossessive } from "@/lib/turkish";
import { Trophy } from "lucide-react";
import { Link } from "@/i18n/navigation";

/** Anlamlı oran için gereken asgari karara bağlanmış teklif sayısı. */
const MIN_DECIDED_FOR_RATE = 10;

/**
 * Kazanma oranı şeridi — satış anasayfasındaki "vanity" konumundan raporlar
 * hub'ına taşındı (pano refactor Faz 1). Örneklem küçükken (< 10 karar) oran
 * GÖSTERİLMEZ; yanıltıcı %100/%0 yerine eşik notu çıkar.
 */
export function WinRateCard() {
  const t = useTranslations("web.panel.shell.winRateCard");
  const locale = useLocale();
  const analytics = useSatisAnalytics("year");

  if (analytics.isLoading) {
    return (
      <div className="h-10 animate-pulse rounded-lg bg-zinc-200/60" aria-hidden />
    );
  }
  const winLoss = analytics.data?.winLoss;
  if (!winLoss) return null;

  const decided = winLoss.reduce((a, w) => a + w.won + w.lost, 0);
  const won = winLoss.reduce((a, w) => a + w.won, 0);

  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm shadow-sm"
      aria-label={
        decided >= MIN_DECIDED_FOR_RATE
          ? t("kazanmaOraniYuzdeSon12", { round: Math.round((won / decided) * 100), decided: decided, won: won })
          : t("kazanmaOraniIcinHenuzYeterli")
      }
    >
      <Trophy className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
      {decided >= MIN_DECIDED_FOR_RATE ? (
        <>
          <span className="font-semibold tabular-nums text-slate-950">
            {t("kazanmaOrani", { pct: Math.round((won / decided) * 100) })}
          </span>
          <span className="text-slate-500">
            {t("son12Ay", {
              heroWinSupport: t("kararaBaglananTeklifinKazandi", {
                total: decided,
                // Türkçe iyelik eki sayının okunuşuna bağlı (3'ü / 5'i) — ek
                // KODDA üretilir, çeviri tek yer tutucu görür. Yalnız Türkçede.
                won: locale === "tr" ? `${won}${numberPossessive(won)}` : String(won),
              }),
            })}
          </span>
        </>
      ) : (
        <span className="text-slate-500">
          {t("anlamliOran", { min: MIN_DECIDED_FOR_RATE, decided })}
        </span>
      )}
      <Link
        href="/company/satis/tekliflerim"
        className="ml-auto shrink-0 text-xs font-semibold text-slate-500 underline hover:text-slate-900"
      >
        {t("tekliflerim")}
      </Link>
    </div>
  );
}
