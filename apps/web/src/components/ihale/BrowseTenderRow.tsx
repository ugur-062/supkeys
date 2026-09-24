"use client";

import { useTranslations } from "next-intl";
import { formatDate } from "@/lib/format-date";
import { useActivityLabel, useListingTerms, useSellerStateLabel } from "@/i18n/domain";
import type { SellerTenderRow } from "@/hooks/use-seller-tenders";
import {
  closingUrgency,
  daysUntil,
  deriveSellerTenderState,
} from "@/lib/tenders/seller-state";
import { cn } from "@/lib/utils";
import { ScopeChip } from "@/components/tenders/scope-chip";
import { Building2, Lock } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { ListingCard, ROW_FOCUS, type ListingCardData } from "@/components/marketplace/listing-card";
import { IhaleItemsPanel } from "./IhaleItemsPanel";
import { DaysLeftChip, InfoChip, useExpiredNote } from "./IhaleListRow";

/**
 * Başkalarının talepleri için yoğun SATIR görünümü (Açık Talepler) —
 * Taleplerim'deki IhaleListRow ile aynı görsel dil; fark: talep sahibi
 * kişi değil FİRMA (owner.name; maskeli listede "Gizli firma · Premium") ve
 * sağ uç metrik benim teklifim. Kart görünümü kaldırıldı (tek görünüm bu,
 * kullanıcı isteği 2026-08-03). Rozet kalabalığı (davet/bağlantı/kategori)
 * genişletme satırında.
 */

// B9: tek tarih dili — kanonik formatlayıcı (yıl her yerde görünür).
const shortDate = (iso: string | null) => formatDate(iso, "short");
const fullDate = (iso: string | null) => formatDate(iso, "datetime");


/**
 * BAŞKASININ talebi — `ListingCard` row ADAPTÖRÜ (Açık Talepler / pano
 * widget'ı). Düzen kartta; burada SellerTenderRow → sütun kümesi: Firma ·
 * Kalem · Kapsam · Kapanış · Kategori, sağ altta Teklifim ya da "Teklif ver".
 * Rozet kalabalığı (davet/bağlantı/eşleşme) başlık altında; genişletmede
 * tembel kalem tablosu.
 */
export function BrowseTenderRow({
  t,
  compact = false,
}: {
  t: SellerTenderRow;
  /** Pano özet widget'ı — tek satır (firma · kapanış · eylem), panel yok. */
  compact?: boolean;
}) {
  const tr = useTranslations("web.panel.requests.browsetenderrow");
  const sellerStateLabel = useSellerStateLabel();
  const activityLabel = useActivityLabel();
  const expiredNote = useExpiredNote();
  const state = deriveSellerTenderState(t.status, t.myBidStatus, t.invited);
  const urgency = closingUrgency(t.status, t.closesAt);

  // Açık talepler artık satış ANASAYFASINDA (2026-09-05) — geri bağlantı oraya.
  const fromHref = "/company/satis#acik-talepler";
  const fromLabel = useListingTerms("ACIK_TALEP").title;
  const detailHref = `/company/ilan/${t.id}?from=${encodeURIComponent(fromHref)}&fromLabel=${encodeURIComponent(fromLabel)}`;

  const strip =
    t.status !== "OPEN"
      ? "border-l-slate-400"
      : t.myBidStatus
        ? "border-l-blue-500"
        : t.invited
          ? "border-l-amber-500"
          : "border-l-emerald-500";

  // Benim teklifim → kısa etiket (sağ uç metrik); sürüm eki "· v2".
  const myBase = !t.myBidStatus
    ? null
    : t.myBidStatus === "SUBMITTED"
      ? tr("verildi")
      : t.myBidStatus === "WON" || t.myBidStatus === "AWARDED_PARTIAL"
        ? tr("kazandiniz")
        : t.myBidStatus === "LOST"
          ? tr("kaybedildi")
          : t.myBidStatus === "DRAFT"
            ? tr("taslak")
            : t.myBidStatus;
  const my =
    myBase && t.myBidVersion && t.myBidVersion > 1
      ? tr("teklifSurumu", { label: myBase, version: t.myBidVersion })
      : myBase;
  const hiddenOwner = !t.owner;
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  const firma = {
    label: tr("firma"),
    value: t.owner ? (
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-emerald-50">
          <Building2 className="h-3 w-3 text-emerald-600" aria-hidden />
        </span>
        <span className="truncate font-semibold text-slate-900" title={t.owner.name}>
          {t.owner.name}
        </span>
      </span>
    ) : (
      <span className="flex items-center gap-1.5">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-amber-50">
          <Lock className="h-3 w-3 text-amber-500" aria-hidden />
        </span>
        <span className="truncate italic text-slate-500">{tr("gizliFirma")}</span>
        <InfoChip tone="amber">{tr("premium")}</InfoChip>
      </span>
    ),
  };
  const kapanis = {
    label: tr("kapanis"),
    value: (
      <span title={fullDate(t.closesAt)}>
        <span
          className={cn(
            "font-semibold",
            urgency && (daysUntil(t.closesAt) ?? 99) <= 3 ? urgency.className : "text-slate-900",
          )}
        >
          {shortDate(t.closesAt)}
        </span>
        <span className="mt-1 block">
          <DaysLeftChip status={t.status} closesAt={t.closesAt} />
        </span>
      </span>
    ),
  };
  const kalem = {
    label: tr("kalem"),
    value: (
      <span className="flex items-baseline gap-1">
        <span className="font-semibold tabular-nums text-slate-900">{t.itemCount}</span>
        <span className="text-[11px] text-slate-400">{tr("kalemLower")}</span>
        <span className="ml-1 inline-flex rounded border border-slate-200 bg-white px-1 py-px tabular-nums text-[10px] font-semibold text-slate-500">
          {t.currency}
        </span>
      </span>
    ),
  };
  const kapsam = {
    label: tr("gorunurluk"),
    value: (
      <span className="flex flex-col items-start gap-1">
        <ScopeChip targetCountries={t.targetCountries} />
        {t.format === "ENGLISH_AUCTION" ? (
          <InfoChip tone="violet">{tr("pazarlik")}</InfoChip>
        ) : (
          <span className="text-[11px] leading-tight text-slate-400">{tr("teklifToplama")}</span>
        )}
      </span>
    ),
  };
  const kategori = {
    label: tr("kategori"),
    value:
      t.categories.length > 0 ? (
        <span title={t.categories.map((c) => c.name).join(", ")}>
          <span
            className={cn(
              "block truncate font-medium",
              t.categoryMatch ? "text-blue-700" : "text-slate-700",
            )}
          >
            {t.categories[0]!.name}
          </span>
          {t.categories.length + t.extraCategoryCount > 1 ? (
            <span className="block text-[11px] leading-tight text-slate-400">
              {tr("artiNKategori", { n: t.categories.length + t.extraCategoryCount - 1 })}
            </span>
          ) : null}
        </span>
      ) : (
        <span className="text-slate-300">—</span>
      ),
  };

  // "Teklif ver": teklifim yoksa ve verilebiliyorsa (4d — "TEKLİFİM —" boş
  // hücresi yerine eylem). Kompakt kartta her durumda bir eylem var.
  const canBidNow = !my && t.canBid && t.status === "OPEN";
  const action = canBidNow
    ? { label: tr("teklifVer"), href: detailHref }
    : compact
      ? { label: my ? tr("teklifim") : tr("incele"), href: detailHref }
      : null;

  const data: ListingCardData = {
    id: t.id,
    href: detailHref,
    number: t.number,
    title: t.title,
    kind: "talep",
    coverImageUrl: t.coverImageUrl,
    categoryIds: t.categories.map((c) => c.code),
    status: { label: sellerStateLabel(state.key), className: state.className },
    strip,
    timeNote: expiredNote(t.status, t.closesAt),
    // Küçük belge ikonu KALKTI (2026-09-19 v3 kartı başlıkta kendi ikon karosunu taşır).
    // Eşleşme rozeti BAŞLIKTA (her genişlikte): kartın "neden buradayım"
    // cevabı — yalnız kategori kolonunda kalınca mobilde hiç görünmüyordu.
    chips: (
      <>
        {t.invited ? <InfoChip tone="amber">{tr("sizeOzelDavet")}</InfoChip> : null}
        {!t.invited && t.connected ? <InfoChip tone="violet">{tr("baglantili")}</InfoChip> : null}
        {/* Sarmalayıcı inline-flex: satır içi span çipe fazladan satır
            yüksekliği veriyordu → yan yana çiplerin boyu eşit değildi
            (2026-09-19, kullanıcı). */}
        {t.productMatch ? (
          <span className="inline-flex" title={t.matchedProduct ? tr("katalogunuzdakiUrun", { matchedProduct: t.matchedProduct }) : undefined}>
            <InfoChip tone="emerald">{tr("urununuzleEslesti")}</InfoChip>
          </span>
        ) : null}
        {t.categoryMatch ? <InfoChip tone="blue">{tr("profilinizleEslesti")}</InfoChip> : null}
        {/* Sıralamada öne geldiyse SEBEBİ görünmeli; tercih uymuyorsa da talep
            listede kalır (eleme yok) — o yüzden rozet yalnız UYAN'a basılır. */}
        {t.activityMatch ? (
          <span
            className="inline-flex"
            title={(t.preferredActivities ?? []).map((code) => activityLabel(code)).join(" · ")}
          >
            <InfoChip tone="slate">{tr("arananTedarikciTipi")}</InfoChip>
          </span>
        ) : null}
      </>
    ),
    facts: compact ? [firma, kapanis] : [firma, kalem, kapsam, kapanis, kategori],
    metric: my
      ? {
          label: tr("teklifim"),
          value: (
            <Link
              href={detailHref}
              onClick={stop}
              className={cn("text-blue-600 hover:underline", ROW_FOCUS)}
            >
              {my}
            </Link>
          ),
        }
      : null,
    action,
    expandable: compact
      ? null
      : {
          id: `browse-row-detay-${t.id}`,
          render: () => (
            <>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                {t.invited ? (
                  <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-700">
                    {tr("davetlisiniz")}
                  </span>
                ) : null}
                {!t.invited && t.connected ? (
                  <span className="rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 font-semibold text-violet-700">
                    {tr("baglantili")}
                  </span>
                ) : null}
                {t.visibility === "PUBLIC" ? (
                  <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-700">
                    {tr("herkeseAcik")}
                  </span>
                ) : null}
                {t.productMatch ? (
                  <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-700">
                    {t.matchedProduct ? tr("urununuz", { matchedProduct: t.matchedProduct }) : tr("urununuzleEslesti")}
                  </span>
                ) : null}
                {t.categoryMatch ? (
                  <span className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 font-semibold text-blue-700">
                    {tr("profilinizleEslesti")}
                  </span>
                ) : null}
                {/* "NEDEN GÖSTERİLDİ" — ilgi motorunun kara kutu olmaması için
                    zorunlu. Metin backend'in ham sinyal dökümünden türer,
                    model metninden DEĞİL. */}
                {t.matchReason ? (
                  <span
                    className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-slate-600"
                    title={tr("buTalepGecmisEtkinliginizeGore")}
                  >
                    {t.matchReason}
                  </span>
                ) : null}
                {t.categories.map((c) => (
                  <span
                    key={c.code}
                    className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-slate-600"
                  >
                    {c.name}
                  </span>
                ))}
                {t.extraCategoryCount > 0 ? (
                  <span className="text-slate-400">+{t.extraCategoryCount}</span>
                ) : null}
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-4">
                {(
                  [
                    [tr("kapanis"), fullDate(t.closesAt) || "—"],
                    [tr("kalem"), String(t.itemCount)],
                    [tr("paraBirimi"), t.currency],
                    [tr("usul"), t.format === "ENGLISH_AUCTION" ? tr("pazarlik") : tr("teklifToplama")],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-[11px] text-slate-400">{k}</dt>
                    <dd className="text-[13px] leading-tight text-slate-700">{v}</dd>
                  </div>
                ))}
              </dl>
              <IhaleItemsPanel
                listingId={t.id}
                detailHref={detailHref}
                itemsTab={1}
                initialCount={t.itemCount}
              />
              <Link
                href={detailHref}
                className={cn(
                  "mt-2 inline-block rounded text-[12px] font-medium text-blue-600 hover:underline",
                  ROW_FOCUS,
                )}
              >
                {hiddenOwner ? tr("detayaGit") : tr("kalemlerVeTumDetay")}
              </Link>
            </>
          ),
        },
  };

  return <ListingCard variant="row" dense={compact} data={data} />;
}
