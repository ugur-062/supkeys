"use client";

import { formatDate } from "@/lib/format-date";
import { MODULE_LABELS } from "@/lib/company/portals";
import { OWNER_COLUMN_LABEL } from "@/lib/company/terms";
import { IhaleItemsPanel } from "./IhaleItemsPanel";
import type { TenderListItem } from "@/hooks/use-company-tenders";
import { closingUrgency, daysUntil } from "@/lib/tenders/seller-state";
import { cn } from "@/lib/utils";
import { differenceInCalendarDays } from "date-fns";
import { FileText, Star } from "lucide-react";
import Link from "next/link";
import { ListingCard, ROW_FOCUS, type ListingCardData } from "@/components/marketplace/listing-card";
import { expiredNote } from "@/lib/tenders/seller-state";

/**
 * Yoğun SATIR görünümü — referans tasarım uyarlaması. Veri sözleşmesi:
 * mevcut TenderListItem (yeni API yok). Referansta olup veride OLMAYAN
 * alanlar (il/adres, ödeme vadesi, iletişim, kalem listesi) UYDURULMAZ:
 * il/vade kolonları çizilmez; yetkili = ihaleyi açan (Satın Almacı/Satışçı);
 * "Nakliyat" kolonu bizde Kapsam (Yurtiçi/Uluslararası). Favori yalnız
 * yerel tercih (localStorage) — sunucu alanı yok.
 */
export const IHALE_VIEW_FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

interface StatusStyle {
  label: string;
  strip: string;
  box: string;
}

/** Durum → şerit + dikey rozet (referans 4 kova + Taslak). */
export function statusStyle(status: TenderListItem["status"]): StatusStyle {
  switch (status) {
    case "OPEN":
      return {
        label: "Yayında",
        strip: "border-l-emerald-500",
        box: "bg-emerald-50 text-emerald-700 ring-emerald-200",
      };
    case "IN_APPROVAL":
    case "IN_AWARD":
    case "IN_AWARD_APPROVAL":
      return {
        label: "Değerlendirmede",
        strip: "border-l-amber-500",
        box: "bg-amber-50 text-amber-700 ring-amber-200",
      };
    case "AWARDED":
      return {
        label: "Tamamlandı",
        strip: "border-l-slate-400",
        box: "bg-slate-100 text-slate-600 ring-slate-200",
      };
    case "DRAFT":
      return {
        label: "Taslak",
        strip: "border-l-slate-400",
        box: "bg-slate-100 text-slate-600 ring-slate-200",
      };
    default: // CANCELLED, CLOSED, CLOSED_NO_AWARD
      return {
        label: "Kapalı",
        strip: "border-l-rose-500",
        box: "bg-rose-50 text-rose-700 ring-rose-200",
      };
  }
}

// B9: tek tarih dili — kanonik formatlayıcı (yıl her yerde görünür).
const shortDate = (iso: string | null) => formatDate(iso, "short");
const fullDate = (iso: string | null) => formatDate(iso, "datetime");


/** Küçük bilgi çipi — kolonlardaki "hep aynı gri metin" yerine tonlu ayrım
 *  (her iki satır görünümü: kendi ihalelerim + başkalarının ihaleleri). */
export function InfoChip({
  tone,
  children,
}: {
  tone: "emerald" | "violet" | "amber" | "rose" | "slate" | "blue";
  children: React.ReactNode;
}) {
  const cls = {
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    violet: "bg-violet-50 text-violet-700 ring-violet-200",
    amber: "bg-amber-50 text-amber-700 ring-amber-200",
    rose: "bg-rose-50 text-rose-700 ring-rose-200",
    blue: "bg-blue-50 text-blue-700 ring-blue-200",
    slate: "bg-slate-50 text-slate-500 ring-slate-200",
  }[tone];
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded px-1.5 py-0.5 text-[10px] font-semibold leading-tight ring-1",
        cls,
      )}
    >
      {children}
    </span>
  );
}

/** Kapanışa kalan süre çipi: ≤1 gün kırmızı, ≤3 amber, aksi nötr. */
export function DaysLeftChip({
  status,
  closesAt,
}: {
  status: string;
  closesAt: string | null;
}) {
  const u = closingUrgency(status, closesAt);
  if (!u) return null;
  const days = daysUntil(closesAt) ?? 99;
  const tone: "rose" | "amber" | "slate" =
    days <= 1 ? "rose" : days <= 3 ? "amber" : "slate";
  return <InfoChip tone={tone}>{u.text}</InfoChip>;
}

export interface IhaleListRowProps {
  t: TenderListItem;
  listingType: "ALIM" | "SATIS";
  favorite: boolean;
  onToggleFavorite: (id: string) => void;
}

/**
 * KENDİ ilanım/talebim — `ListingCard` row ADAPTÖRÜ (v2 denetimi). Düzen
 * (kod+ad · rozet · sabit sütunlar · tüm satır tıklanır) kartta; burada
 * yalnız TenderListItem → sütun kümesi: Sorumlu · Davetli · Kapsam · Yayın
 * · Kapanış · Kategori, sağ altta Teklifler.
 */
export function IhaleListRow({
  t,
  listingType,
  favorite,
  onToggleFavorite,
}: IhaleListRowProps) {
  const isSatis = listingType === "SATIS";
  const st = statusStyle(t.status);

  const fromHref = isSatis
    ? "/company/satis/ilanlarim"
    : "/company/satinalma/taleplerim";
  const fromLabel = isSatis
    ? MODULE_LABELS.satis.ilanlarim
    : MODULE_LABELS.satinalma.ihalelerim;
  const detailHref = `/company/ilan/${t.id}?from=${encodeURIComponent(fromHref)}&fromLabel=${encodeURIComponent(fromLabel)}`;

  // Kapanışa < 3 gün → tarih vurgusu (yalnız açık ihalede).
  const closeSoon =
    t.status === "OPEN" &&
    !!t.bidsCloseAt &&
    differenceInCalendarDays(new Date(t.bidsCloseAt), new Date()) < 3;

  const data: ListingCardData = {
    id: t.id,
    href: detailHref,
    number: t.tenderNumber,
    title: t.title,
    kind: isSatis ? "ilan" : "talep",
    categoryIds: t.categoryIds,
    status: { label: st.label, className: st.box },
    strip: st.strip,
    timeNote: expiredNote(t.status, t.bidsCloseAt),
    leading: (
      <div className="flex shrink-0 flex-col items-center gap-1 pt-0.5">
        <FileText
          className={cn("h-4 w-4", isSatis ? "text-emerald-500" : "text-blue-500")}
          aria-hidden
        />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(t.id);
          }}
          aria-label={favorite ? "Favorilerden çıkar" : "Favorilere ekle"}
          aria-pressed={favorite}
          className={cn("rounded", ROW_FOCUS)}
        >
          <Star
            className={cn(
              "h-4 w-4",
              favorite ? "fill-amber-400 text-amber-400" : "text-slate-300",
            )}
            aria-hidden
          />
        </button>
      </div>
    ),
    facts: [
      {
        label: OWNER_COLUMN_LABEL,
        value: (
          <span
            className="block truncate font-semibold text-slate-900"
            title={`${t.createdBy.firstName} ${t.createdBy.lastName}`}
          >
            {t.createdBy.firstName} {t.createdBy.lastName}
          </span>
        ),
      },
      {
        label: "Davetli",
        value: (
          <span
            className={cn(
              "font-semibold tabular-nums",
              t.invitationCount > 0 ? "text-slate-900" : "text-slate-300",
            )}
          >
            {t.invitationCount}
          </span>
        ),
      },
      {
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
      },
      {
        label: "Yayın",
        value: (
          <span className="text-slate-500" title={fullDate(t.publishedAt ?? t.createdAt)}>
            {shortDate(t.publishedAt ?? t.createdAt)}
          </span>
        ),
      },
      {
        label: "Kapanış",
        value: (
          <span title={fullDate(t.bidsCloseAt)}>
            <span className={cn("font-semibold", closeSoon ? "text-rose-600" : "text-slate-900")}>
              {shortDate(t.bidsCloseAt)}
            </span>
            <span className="mt-1 block">
              <DaysLeftChip status={t.status} closesAt={t.bidsCloseAt} />
            </span>
          </span>
        ),
      },
      {
        label: "Kategori",
        value:
          t.categories.length > 0 ? (
            <span title={t.categories.map((c) => c.name).join(", ")}>
              <span className="block truncate font-medium text-slate-700">
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
      },
    ],
    metric: {
      label: "Teklifler",
      value:
        t.bidCount > 0 ? (
          <Link
            href={detailHref}
            onClick={(e) => e.stopPropagation()}
            className={cn("text-blue-600 hover:underline", ROW_FOCUS)}
          >
            {t.bidCount}
          </Link>
        ) : (
          <span className="text-slate-400">0</span>
        ),
    },
    // Accordion — liste verisinin özeti + tembel kalem tablosu (yalnız
    // açıkken fetch; ilk 5 kalem, tamamı detay sayfasında).
    expandable: {
      id: `listing-row-detay-${t.id}`,
      render: () => (
        <>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-4">
            {(
              [
                ["Yayın", fullDate(t.publishedAt ?? t.createdAt) || "—"],
                ["Kapanış", fullDate(t.bidsCloseAt) || "—"],
                ["Davetli", String(t.invitationCount)],
                ["Teklif", String(t.bidCount)],
                ["Usul", t.format === "ENGLISH_AUCTION" ? "Pazarlık" : "Teklif Toplama"],
                ["Kapsam", t.isInternational ? "Uluslararası" : "Yurtiçi"],
                [
                  "Kategori",
                  t.categories.length
                    ? `${t.categories.map((c) => c.name).join(", ")}${t.extraCategoryCount > 0 ? ` +${t.extraCategoryCount}` : ""}`
                    : "—",
                ],
              ] as const
            ).map(([k, v]) => (
              <div key={k}>
                <dt className="text-[11px] text-slate-400">{k}</dt>
                <dd className="text-[13px] leading-tight text-slate-700">{v}</dd>
              </div>
            ))}
          </dl>
          <IhaleItemsPanel listingId={t.id} detailHref={detailHref} itemsTab={2} />
          <Link
            href={detailHref}
            className={cn(
              "mt-2 inline-block rounded text-[12px] font-medium text-blue-600 hover:underline",
              ROW_FOCUS,
            )}
          >
            Kalemler ve tüm detay →
          </Link>
        </>
      ),
    },
  };

  return <ListingCard variant="row" data={data} />;
}
