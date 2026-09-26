"use client";

import { useTranslations } from "next-intl";
import type { ListingDetail } from "@/hooks/use-company-listings";
import { convertAuctionAmount } from "@/lib/tenders/auction-currency";
import { cn } from "@/lib/utils";
import { Gavel } from "lucide-react";
import { useEffect, useState } from "react";

/** ms → geri sayım parçaları ("1g 04:05:33" / "04:05:33"); süre dolduysa null. */
function remainingParts(ms: number): { d: number; hh: string } | null {
  if (ms <= 0) return null;
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86_400);
  const h = Math.floor((total % 86_400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const hh = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return { d, hh };
}

/** bidVisibility → katalog anahtarı (`web.panel.requests.auctionLiveCard`). */
const VISIBILITY_KEY: Record<string, string> = {
  OWN_ONLY: "rakipBilgisiKapaliYalnizcaKendi",
  BEST_PRICE: "enIyiTeklifHerkeseGorunur",
  OWN_RANK: "yalnizcaKendiSiraniziGorursunuz",
  BEST_AND_OWN_RANK: "enIyiTeklifKendiSiranGorunur",
  ALL: "tumTekliflerAnonimGorunur",
};

function Tile({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-3.5",
        highlight
          ? "border-amber-200 bg-amber-50"
          : "border-zinc-200 bg-white",
      )}
    >
      <p className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
        {label}
      </p>
      <p className="mt-1 truncate text-lg font-bold text-zinc-950 tabular-nums">
        {value}
      </p>
      {sub ? <p className="mt-0.5 text-xs text-zinc-500">{sub}</p> : null}
    </div>
  );
}

/**
 * Pazarlık (açık eksiltme) canlı kartı — eski tedarikçi panelinin portu.
 * 4 kutu (teklifin / en iyi / sıran / tur hakkı) + 1sn geri sayım +
 * görünürlük etiketi + oto-uzatma notu + (ALL modunda) anonim sıralama.
 * Kapalı zarf korunur: yalnızca sunucunun bidVisibility'ye göre açtığı
 * alanlar gösterilir.
 */
export function AuctionLiveCard({
  l,
  bidderCurrency,
}: {
  l: ListingDetail;
  /** Teklif formunda SEÇİLİ birim — henüz teklif yokken de adım/en-iyi bu
   *  birimde gösterilsin (yoksa myBid birimi → ilan birimi sırası). */
  bidderCurrency?: string;
}) {
  const tr = useTranslations("web.panel.requests.auctionLiveCard");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!l.english?.isEnglishAuction) return null;

  const closesMs = l.closesAt ? new Date(l.closesAt).getTime() - now : null;
  const urgent = closesMs !== null && closesMs > 0 && closesMs < 5 * 60_000;
  const remaining = closesMs !== null ? remainingParts(closesMs) : null;
  const remainingText =
    closesMs === null
      ? null
      : remaining
        ? remaining.d > 0
          ? tr("gunSaatGeriSayim", { d: remaining.d, time: remaining.hh })
          : remaining.hh
        : tr("kapandi");
  const visibilityKey = VISIBILITY_KEY[l.bidVisibility ?? ""];
  const view = l.auctionView;
  const sym = (c: string | null | undefined) =>
    !c || c === "TRY" ? "₺" : c;
  const money = (v: string | null | undefined, currency?: string | null) =>
    v
      ? `${Number(v).toLocaleString("tr-TR")} ${sym(currency ?? l.primaryCurrency)}`
      : "—";

  // Teklifçi en iyi teklifi kendi biriminde görür (açılış günü kur damgası).
  const myCurrency =
    bidderCurrency ?? l.myBid?.currency ?? l.primaryCurrency ?? "TRY";
  const rates = l.english?.rateSnapshot ?? null;
  // Turda tek aktif gönderim hakkı (taşınan teklif yakmaz) — sunucudan.
  const canBidThisRound = l.nextBidConstraint?.canBidThisRound ?? true;

  // Kısmi teklif (kalemli ilanda tüm kalemler fiyatlanmadı): toplamı
  // diğerleriyle kıyaslanamaz — sunucu sıralamaya almaz; "Gizli" yerine
  // nedenini söyle.
  const itemCount = l.items?.length ?? l.itemCount ?? 0;
  const myPricedCount = (l.myBid?.items ?? []).filter(
    (x) => Number(x.unitPrice) > 0,
  ).length;
  const myBidPartial =
    itemCount > 0 && !!l.myBid && myPricedCount < itemCount;

  // En iyi teklif kendi birimiyle gelir; teklifçinin biriminden farklıysa
  // altta yaklaşık karşılığı gösterilir (karar verirken çeviriyle uğraşmasın).
  const bestCur = view?.bestCurrency ?? l.primaryCurrency ?? "TRY";
  const bestInMyCurrency =
    view?.bestTotal && bestCur !== myCurrency
      ? convertAuctionAmount(Number(view.bestTotal), bestCur, myCurrency, rates)
      : null;

  return (
    <section className="rounded-2xl border border-amber-200/70 bg-amber-50/40 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
          <Gavel className="h-3.5 w-3.5" aria-hidden="true" />
          {tr("pazarlikAcikEksiltmeTur", { currentRound: l.english.currentRound })}
        </span>
        {closesMs !== null ? (
          <span
            className={cn(
              " text-sm font-bold tabular-nums",
              urgent ? "text-red-600" : "text-zinc-700",
            )}
          >
            {remainingText}
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          label={tr("teklifiniz")}
          // Teklifçinin KENDİ para birimiyle gösterilir (ilanınkiyle değil).
          // Versiyon alt yazısı kaldırıldı — tedarikçiye teknik gürültü.
          value={l.myBid ? money(l.myBid.amount, l.myBid.currency) : "—"}
          highlight={!!l.myBid}
        />
        <Tile
          label={tr("enIyiTeklif")}
          value={view?.bestTotal ? money(view.bestTotal, bestCur) : tr("gizli")}
          sub={
            bestInMyCurrency != null
              ? `≈ ${bestInMyCurrency.toLocaleString("tr-TR", {
                  maximumFractionDigits: 2,
                })} ${sym(myCurrency)}`
              : undefined
          }
        />
        <Tile
          label={tr("siralaman")}
          value={
            view?.myRank != null && view.participantCount != null
              ? `${view.myRank} / ${view.participantCount}`
              : myBidPartial
                ? "—"
                : tr("gizli")
          }
          sub={
            myBidPartial
              ? tr("kismiTeklifKalemSiralamayaGirmez", { myPricedCount: myPricedCount, itemCount: itemCount })
              : undefined
          }
        />
        <Tile
          label={tr("turHakkin")}
          value={canBidThisRound ? tr("birTeklif") : tr("kullanildi")}
          sub={
            canBidThisRound
              ? tr("oncekindenDusukOlmali")
              : // Yeni tur garanti değil — söz vermeden anlat.
                tr("buTurdakiTeklifinizKesinAlici")
          }
          highlight={!canBidThisRound}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
        <span
          className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500"
          aria-hidden="true"
        />
        <span>{visibilityKey ? tr(visibilityKey as never) : ""}</span>
        {l.autoExtendOnLateBid && l.autoExtendThresholdMin ? (
          <span>
            {tr("otoUzatmaNotu", {
              threshold: l.autoExtendThresholdMin,
              by: l.autoExtendByMinutes ?? 0,
            })}
          </span>
        ) : null}
      </div>

      {view?.allBids && view.allBids.length > 0 ? (
        <div className="mt-3 rounded-lg border border-zinc-200 bg-white">
          <div className="border-b border-zinc-100 px-4 py-2 text-xs font-medium text-zinc-500">
            {tr("tumTekliflerAnonim")}
          </div>
          <ul className="divide-y divide-zinc-100">
            {view.allBids.map((b) => (
              <li
                key={b.rank}
                className={cn(
                  "flex items-center justify-between px-4 py-2 text-sm",
                  b.isMine && "bg-amber-50 font-semibold",
                )}
              >
                <span className="text-zinc-500">
                  #{b.rank} {b.isMine ? tr("sen") : tr("tedarikci")}
                </span>
                <span className="text-zinc-900 tabular-nums">
                  {money(b.total, b.currency ?? l.primaryCurrency)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
