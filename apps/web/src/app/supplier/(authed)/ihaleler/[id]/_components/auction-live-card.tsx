"use client";

// V2-7 — İngiliz Usulü açık eksiltme canlı bilgi kartı.
// Tedarikçi tarafında bidVisibility moduna göre filtrelenmiş bilgileri ve
// kalan süreyi gösterir. Polling tarafı useSupplierTenderDetail içinde.

import type { SupplierTenderDetail } from "@/lib/tenders/types";
import { Crown, Gavel, Timer, TrendingDown, Trophy, Users } from "lucide-react";
import { useEffect, useState } from "react";

interface Props {
  tender: SupplierTenderDetail;
}

function formatCountdown(ms: number): {
  text: string;
  urgent: boolean;
} {
  if (ms <= 0) return { text: "Kapandı", urgent: true };
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const urgent = totalSec < 5 * 60;
  if (h > 0) return { text: `${h}sa ${m}dk ${s}sn`, urgent: false };
  return { text: `${m}dk ${s.toString().padStart(2, "0")}sn`, urgent };
}

function formatPrice(value: number, decimals: number): string {
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function AuctionLiveCard({ tender }: Props) {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (tender.type !== "ENGLISH_AUCTION") return null;

  const closeMs = new Date(tender.bidsCloseAt).getTime();
  const left = closeMs - now;
  const countdown = formatCountdown(left);

  const view = tender.auctionView;
  const visibility = tender.bidVisibility;
  const decimals = tender.decimalPlaces ?? 2;

  const visibilityLabel: Record<typeof visibility, string> = {
    OWN_ONLY: "Sadece kendi teklifin",
    BEST_PRICE: "En iyi teklif görünür",
    OWN_RANK: "Sıralaman görünür",
    BEST_AND_OWN_RANK: "En iyi teklif + sıralaman",
    ALL: "Tüm teklifler ve sıralama",
  };

  return (
    <section className="card p-4 border-2 border-zinc-200 bg-gradient-to-br from-zinc-50/60 to-white">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-zinc-100/70 text-zinc-800 text-xs font-bold uppercase tracking-wide">
          <Gavel className="w-3.5 h-3.5" />
          İngiliz Usulü Açık Eksiltme
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Timer
            className={
              countdown.urgent
                ? "w-4 h-4 text-danger-600 animate-pulse"
                : "w-4 h-4 text-slate-500"
            }
          />
          <span
            className={
              countdown.urgent
                ? "font-mono font-bold text-danger-700"
                : "font-mono font-semibold text-zinc-900"
            }
          >
            {countdown.text}
          </span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* My bid */}
        <div className="rounded-lg ring-1 ring-zinc-950/5 bg-white p-3">
          <p className="text-[11px] text-slate-500 uppercase font-semibold tracking-wide flex items-center gap-1.5">
            <Crown className="w-3 h-3 text-slate-400" />
            Senin Toplam Teklifin
          </p>
          <p className="mt-1 font-mono font-bold text-zinc-900">
            {tender.myBid
              ? `${formatPrice(Number(tender.myBid.totalAmount), decimals)} ${tender.primaryCurrency}`
              : "—"}
          </p>
          {tender.myBid?.version ? (
            <p className="text-[11px] text-slate-500 mt-0.5">
              Tur #{tender.myBid.version}
            </p>
          ) : null}
        </div>

        {/* Best price (görünürlüğe göre) */}
        <div className="rounded-lg ring-1 ring-zinc-950/5 bg-white p-3">
          <p className="text-[11px] text-slate-500 uppercase font-semibold tracking-wide flex items-center gap-1.5">
            <Trophy className="w-3 h-3 text-warning-500" />
            En İyi Teklif
          </p>
          <p className="mt-1 font-mono font-bold text-success-700">
            {view?.bestTotal != null
              ? `${formatPrice(view.bestTotal, decimals)} ${tender.primaryCurrency}`
              : "Gizli"}
          </p>
        </div>

        {/* My rank (görünürlüğe göre) */}
        <div className="rounded-lg ring-1 ring-zinc-950/5 bg-white p-3">
          <p className="text-[11px] text-slate-500 uppercase font-semibold tracking-wide flex items-center gap-1.5">
            <TrendingDown className="w-3 h-3 text-zinc-500" />
            Sıralaman
          </p>
          <p className="mt-1 font-bold text-zinc-900">
            {view?.myRank != null && view.participantCount != null
              ? `${view.myRank} / ${view.participantCount}`
              : "Gizli"}
          </p>
        </div>

        {/* Decrement kuralı */}
        <div className="rounded-lg ring-1 ring-zinc-950/5 bg-white p-3">
          <p className="text-[11px] text-slate-500 uppercase font-semibold tracking-wide flex items-center gap-1.5">
            <Users className="w-3 h-3 text-slate-400" />
            Min. Azaltma
          </p>
          <p className="mt-1 font-bold text-zinc-900">
            {tender.priceDecrementType && tender.priceDecrementValue
              ? tender.priceDecrementType === "PERCENT"
                ? `% ${Number(tender.priceDecrementValue)}`
                : `${formatPrice(Number(tender.priceDecrementValue), decimals)} ${tender.primaryCurrency}`
              : "—"}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Kendi son teklifine göre
          </p>
        </div>
      </div>

      <p className="mt-3 text-[11px] text-slate-500 flex items-center gap-1">
        <span className="inline-block w-2 h-2 rounded-full bg-success-500 animate-pulse" />
        Görünürlük: <span className="font-semibold">{visibilityLabel[visibility]}</span>
        {tender.autoExtendOnLateBid ? (
          <span className="ml-2">
            · Son {tender.autoExtendThresholdMin}dk içinde gelen teklif kapanışı{" "}
            {tender.autoExtendByMinutes}dk uzatır.
          </span>
        ) : null}
      </p>

      {/* ALL mod: anonim ranking listesi */}
      {visibility === "ALL" && view?.allBids && view.allBids.length > 0 ? (
        <div className="mt-4 rounded-lg border border-slate-200 overflow-hidden">
          <div className="bg-slate-50 px-3 py-2 text-[11px] uppercase font-bold text-slate-600 tracking-wide flex justify-between">
            <span>Anonim Sıralama</span>
            <span>{view.allBids.length} tedarikçi</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {view.allBids.map((b) => (
              <li
                key={b.rank}
                className={
                  b.isMine
                    ? "flex justify-between px-3 py-2 text-sm bg-zinc-50/50 font-semibold"
                    : "flex justify-between px-3 py-2 text-sm"
                }
              >
                <span>
                  #{b.rank} {b.isMine ? "(Sen)" : "Tedarikçi"}
                </span>
                <span className="font-mono">
                  {formatPrice(b.total, decimals)} {tender.primaryCurrency}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
