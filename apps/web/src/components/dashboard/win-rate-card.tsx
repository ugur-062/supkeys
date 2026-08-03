"use client";

import { useSatisAnalytics } from "@/hooks/use-company-dashboard";
import { DASH } from "@/lib/dashboard/strings";
import { Trophy } from "lucide-react";
import Link from "next/link";

/** Anlamlı oran için gereken asgari karara bağlanmış teklif sayısı. */
const MIN_DECIDED_FOR_RATE = 10;

/**
 * Kazanma oranı şeridi — satış anasayfasındaki "vanity" konumundan raporlar
 * hub'ına taşındı (pano refactor Faz 1). Örneklem küçükken (< 10 karar) oran
 * GÖSTERİLMEZ; yanıltıcı %100/%0 yerine eşik notu çıkar.
 */
export function WinRateCard() {
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
          ? `Kazanma oranı yüzde ${Math.round((won / decided) * 100)} — son 12 ayda karara bağlanan ${decided} teklifin ${won} tanesi kazandı`
          : "Kazanma oranı için henüz yeterli veri yok"
      }
    >
      <Trophy className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
      {decided >= MIN_DECIDED_FOR_RATE ? (
        <>
          <span className="font-semibold tabular-nums text-slate-950">
            {DASH.heroWinTitle(String(Math.round((won / decided) * 100)))}
          </span>
          <span className="text-slate-500">
            {DASH.heroWinSupport(won, decided)} · son 12 ay
          </span>
        </>
      ) : (
        <span className="text-slate-500">
          Anlamlı oran için en az {MIN_DECIDED_FOR_RATE} karara bağlanmış teklif
          gerekir
          {decided > 0 ? ` — şu ana kadar ${decided}` : ""}.
        </span>
      )}
      <Link
        href="/company/satis/tekliflerim"
        className="ml-auto shrink-0 text-xs font-semibold text-slate-500 underline hover:text-slate-900"
      >
        Tekliflerim
      </Link>
    </div>
  );
}
