"use client";

import { formatDate } from "@/lib/format-date";
import { MODULE_LABELS } from "@/lib/company/portals";
import type { SellerTenderRow } from "@/hooks/use-seller-tenders";
import {
  closingUrgency,
  daysUntil,
  deriveSellerTenderState,
} from "@/lib/tenders/seller-state";
import { cn } from "@/lib/utils";
import { Building2, FileText, Lock } from "lucide-react";
import Link from "next/link";
import { ListingCard, ROW_FOCUS, type ListingCardData } from "@/components/marketplace/listing-card";
import { expiredNote } from "@/lib/tenders/seller-state";
import { IhaleItemsPanel } from "./IhaleItemsPanel";
import { DaysLeftChip, InfoChip } from "./IhaleListRow";

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


/** Benim teklifim → kısa etiket (sağ uç metrik). */
function myBidLabel(t: SellerTenderRow): string | null {
  if (!t.myBidStatus) return null;
  const base =
    t.myBidStatus === "SUBMITTED"
      ? "Verildi"
      : t.myBidStatus === "WON" || t.myBidStatus === "AWARDED_PARTIAL"
        ? "Kazandınız"
        : t.myBidStatus === "LOST"
          ? "Kaybedildi"
          : t.myBidStatus === "DRAFT"
            ? "Taslak"
            : t.myBidStatus;
  return t.myBidVersion && t.myBidVersion > 1 ? `${base} · v${t.myBidVersion}` : base;
}

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
  const state = deriveSellerTenderState(t.status, t.myBidStatus, t.invited);
  const urgency = closingUrgency(t.status, t.closesAt);

  const fromHref = "/company/satis/acik-talepler";
  const fromLabel = MODULE_LABELS.satis.acikIhaleler;
  const detailHref = `/company/ilan/${t.id}?from=${encodeURIComponent(fromHref)}&fromLabel=${encodeURIComponent(fromLabel)}`;

  const strip =
    t.status !== "OPEN"
      ? "border-l-slate-400"
      : t.myBidStatus
        ? "border-l-blue-500"
        : t.invited
          ? "border-l-amber-500"
          : "border-l-emerald-500";

  const my = myBidLabel(t);
  const ownerLabel = t.owner ? t.owner.name : "Gizli firma";
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  const firma = {
    label: "Firma",
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
        <span className="truncate italic text-slate-500">Gizli firma</span>
        <InfoChip tone="amber">Premium</InfoChip>
      </span>
    ),
  };
  const kapanis = {
    label: "Kapanış",
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
    label: "Kalem",
    value: (
      <span className="flex items-baseline gap-1">
        <span className="font-semibold tabular-nums text-slate-900">{t.itemCount}</span>
        <span className="text-[11px] text-slate-400">kalem</span>
        <span className="ml-1 inline-flex rounded border border-slate-200 bg-white px-1 py-px font-mono text-[10px] font-semibold text-slate-500">
          {t.currency}
        </span>
      </span>
    ),
  };
  const kapsam = {
    label: "Kapsam",
    value: (
      <span className="flex flex-col items-start gap-1">
        {t.isInternational ? (
          <InfoChip tone="emerald">Uluslararası</InfoChip>
        ) : (
          <InfoChip tone="slate">Yurtiçi</InfoChip>
        )}
        {t.format === "ENGLISH_AUCTION" ? (
          <InfoChip tone="violet">Pazarlık</InfoChip>
        ) : (
          <span className="text-[11px] leading-tight text-slate-400">Teklif Toplama</span>
        )}
      </span>
    ),
  };
  const kategori = {
    label: "Kategori",
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
              +{t.categories.length + t.extraCategoryCount - 1} kategori
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
    ? { label: "Teklif ver", href: detailHref }
    : compact
      ? { label: my ? "Teklifim" : "İncele", href: detailHref }
      : null;

  const data: ListingCardData = {
    id: t.id,
    href: detailHref,
    number: t.number,
    title: t.title,
    kind: "talep",
    coverImageUrl: t.coverImageUrl,
    categoryIds: t.categories.map((c) => c.code),
    status: { label: state.label, className: state.className },
    strip,
    timeNote: expiredNote(t.status, t.closesAt),
    leading: (
      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
    ),
    // Eşleşme rozeti BAŞLIKTA (her genişlikte): kartın "neden buradayım"
    // cevabı — yalnız kategori kolonunda kalınca mobilde hiç görünmüyordu.
    chips: (
      <>
        {t.invited ? <InfoChip tone="amber">Size özel davet</InfoChip> : null}
        {!t.invited && t.connected ? <InfoChip tone="violet">Bağlantılı</InfoChip> : null}
        {t.categoryMatch ? <InfoChip tone="blue">Profilinizle eşleşti</InfoChip> : null}
        {t.masked ? <InfoChip tone="amber">Paket gerekli</InfoChip> : null}
      </>
    ),
    facts: compact ? [firma, kapanis] : [firma, kalem, kapsam, kapanis, kategori],
    metric: my
      ? {
          label: "Teklifim",
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
                    Davetlisiniz
                  </span>
                ) : null}
                {!t.invited && t.connected ? (
                  <span className="rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 font-semibold text-violet-700">
                    Bağlantılı
                  </span>
                ) : null}
                {t.visibility === "PUBLIC" ? (
                  <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-700">
                    Herkese Açık
                  </span>
                ) : null}
                {t.categoryMatch ? (
                  <span className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 font-semibold text-blue-700">
                    Profilinizle eşleşti
                  </span>
                ) : null}
                {/* "NEDEN GÖSTERİLDİ" — ilgi motorunun kara kutu olmaması için
                    zorunlu. Metin backend'in ham sinyal dökümünden türer,
                    model metninden DEĞİL. */}
                {t.matchReason ? (
                  <span
                    className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-slate-600"
                    title="Bu talep geçmiş etkinliğinize göre önceliklendirildi"
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
                    ["Kapanış", fullDate(t.closesAt) || "—"],
                    ["Kalem", String(t.itemCount)],
                    ["Para birimi", t.currency],
                    ["Usul", t.format === "ENGLISH_AUCTION" ? "Pazarlık" : "Teklif Toplama"],
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
                {ownerLabel === "Gizli firma" ? "Detaya git →" : "Kalemler ve tüm detay →"}
              </Link>
            </>
          ),
        },
  };

  return <ListingCard variant="row" dense={compact} data={data} />;
}
