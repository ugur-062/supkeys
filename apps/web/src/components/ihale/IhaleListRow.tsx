"use client";

import { IhaleItemsPanel } from "./IhaleItemsPanel";
import type { TenderListItem } from "@/hooks/use-company-tenders";
import { closingUrgency, daysUntil } from "@/lib/tenders/seller-state";
import { cn } from "@/lib/utils";
import { differenceInCalendarDays, format } from "date-fns";
import { tr } from "date-fns/locale";
import { ChevronRight, FileText, Star } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

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

function shortDate(iso: string | null): string {
  return iso ? format(new Date(iso), "d MMM", { locale: tr }) : "—";
}
function fullDate(iso: string | null): string {
  return iso
    ? format(new Date(iso), "d MMMM yyyy HH:mm", { locale: tr })
    : "";
}

function ColLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="block text-[10px] font-semibold uppercase tracking-wide leading-tight text-slate-400">
      {children}
    </span>
  );
}

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

export function IhaleListRow({
  t,
  listingType,
  favorite,
  onToggleFavorite,
}: IhaleListRowProps) {
  const [expanded, setExpanded] = useState(false);
  const isSatis = listingType === "SATIS";
  const st = statusStyle(t.status);
  const panelId = `ihale-row-detay-${t.id}`;

  const fromHref = isSatis
    ? "/company/satis/ilanlarim"
    : "/company/satinalma/ihalelerim";
  const fromLabel = isSatis ? "Satış İhalelerim" : "İhalelerim";
  const detailHref = `/company/ilan/${t.id}?from=${encodeURIComponent(fromHref)}&fromLabel=${encodeURIComponent(fromLabel)}`;

  // Kapanışa < 3 gün → tarih vurgusu (yalnız açık ihalede).
  const closeSoon =
    t.status === "OPEN" &&
    !!t.bidsCloseAt &&
    differenceInCalendarDays(new Date(t.bidsCloseAt), new Date()) < 3;

  return (
    <div
      role="row"
      className={cn(
        "group/row rounded-lg border-l-[3px] bg-white ring-1 ring-slate-200 transition-all hover:shadow-sm hover:ring-slate-300",
        st.strip,
      )}
    >
      {/* Seçim kolonu KALDIRILDI (kullanıcı isteği, 2026-08-03): toplu sunucu
          işlemi yok — kutu yalnız yer kaplıyordu. */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-stretch xl:grid-cols-[auto_minmax(280px,2fr)_1.2fr_0.9fr_0.9fr_1.1fr_1.1fr_auto_auto] xl:divide-x xl:divide-slate-100">
        {/* 1 — Genişlet (md+) */}
        <div className="hidden items-center px-3 py-2.5 md:flex">
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            aria-controls={panelId}
            aria-label={expanded ? "Detayı gizle" : "Detayı genişlet"}
            className={cn("rounded text-slate-400", IHALE_VIEW_FOCUS)}
          >
            <ChevronRight
              className={cn(
                "h-4 w-4 transition-transform",
                expanded && "rotate-90",
              )}
              aria-hidden
            />
          </button>
        </div>

        {/* 3 — Kimlik + başlık */}
        <div className="min-w-0 px-3 py-2.5">
          <div className="flex items-start gap-2">
            <div className="flex shrink-0 flex-col items-center gap-1 pt-0.5">
              <FileText
                className={cn(
                  "h-4 w-4",
                  isSatis ? "text-emerald-500" : "text-blue-500",
                )}
                aria-hidden
              />
              <button
                type="button"
                onClick={() => onToggleFavorite(t.id)}
                aria-label={
                  favorite ? "Favorilerden çıkar" : "Favorilere ekle"
                }
                aria-pressed={favorite}
                className={cn("rounded", IHALE_VIEW_FOCUS)}
              >
                <Star
                  className={cn(
                    "h-4 w-4",
                    favorite
                      ? "fill-amber-400 text-amber-400"
                      : "text-slate-300",
                  )}
                  aria-hidden
                />
              </button>
            </div>
            <Link
              href={detailHref}
              className={cn("min-w-0 rounded", IHALE_VIEW_FOCUS)}
            >
              <span className="inline-flex rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] tabular-nums leading-tight text-zinc-600">
                {t.tenderNumber}
              </span>
              <span
                className={cn(
                  "mt-1 line-clamp-2 text-[13px] font-semibold leading-tight text-slate-900 transition-colors",
                  isSatis
                    ? "group-hover/row:text-emerald-700"
                    : "group-hover/row:text-blue-700",
                )}
                title={t.title}
              >
                {t.title}
              </span>
            </Link>
          </div>
        </div>

        {/* 4 — Talep sahibi (xl). "Detayı aç" linki KALDIRILDI (çiftti:
            başlık zaten detay linki + sağda duruma göre birincil aksiyon var). */}
        <div className="hidden min-w-0 px-3 py-2.5 xl:block">
          <ColLabel>{isSatis ? "Satışçı" : "Satın Almacı"}</ColLabel>
          <span className="mt-1 block truncate text-[13px] font-semibold leading-tight text-slate-900">
            {t.createdBy.firstName} {t.createdBy.lastName}
          </span>
        </div>

        {/* 5 — Davetli (lg+) — sayı büyük/koyu; 0 davetli soluk kalır. */}
        <div className="hidden px-3 py-2.5 lg:block">
          <ColLabel>Davetli</ColLabel>
          <span className="mt-0.5 flex items-baseline gap-1">
            <span
              className={cn(
                "text-[15px] font-semibold tabular-nums leading-tight",
                t.invitationCount > 0 ? "text-slate-900" : "text-slate-300",
              )}
            >
              {t.invitationCount}
            </span>
            <span className="text-[11px] text-slate-400">davetli</span>
          </span>
        </div>

        {/* 6 — Kapsam (lg+) — çip'lerle ayrım (uluslararası yeşil, pazarlık
            mor; sıradan değerler nötr). */}
        <div className="hidden px-3 py-2.5 lg:block">
          <ColLabel>Kapsam</ColLabel>
          <span className="mt-1 flex flex-col items-start gap-1">
            {t.isInternational ? (
              <InfoChip tone="emerald">Uluslararası</InfoChip>
            ) : (
              <InfoChip tone="slate">Yurtiçi</InfoChip>
            )}
            {t.format === "ENGLISH_AUCTION" ? (
              <InfoChip tone="violet">Pazarlık</InfoChip>
            ) : (
              <span className="text-[11px] leading-tight text-slate-400">
                Teklif Toplama
              </span>
            )}
          </span>
        </div>

        {/* 7 — Tarihler (md+) — kapanış koyu + kalan süre renkli çip. */}
        <div className="hidden px-3 py-2.5 md:block">
          <ColLabel>Yayın tarihi</ColLabel>
          <span
            className="mt-0.5 block text-[13px] leading-tight text-slate-500"
            title={fullDate(t.publishedAt ?? t.createdAt)}
          >
            {shortDate(t.publishedAt ?? t.createdAt)}
          </span>
          <span className="mt-1 block">
            <ColLabel>Kapanış tarihi</ColLabel>
          </span>
          <span
            className={cn(
              "mt-0.5 block text-[13px] font-semibold leading-tight",
              closeSoon ? "text-rose-600" : "text-slate-900",
            )}
            title={fullDate(t.bidsCloseAt)}
          >
            {shortDate(t.bidsCloseAt)}
          </span>
          <span className="mt-1 block">
            <DaysLeftChip status={t.status} closesAt={t.bidsCloseAt} />
          </span>
        </div>

        {/* 8 — Kategori (xl) — aksiyonların yerine (kullanıcı isteği,
            2026-08-04): satır zaten detaya tıklanıyor, işlemler detayda. */}
        <div className="hidden min-w-0 px-3 py-2.5 xl:block">
          <ColLabel>Kategori</ColLabel>
          {t.categories.length > 0 ? (
            <>
              <span
                className="mt-1 block truncate text-[13px] font-medium leading-tight text-slate-700"
                title={t.categories.map((c) => c.name).join(", ")}
              >
                {t.categories[0]!.name}
              </span>
              {t.categories.length + t.extraCategoryCount > 1 ? (
                <span className="mt-0.5 block text-[11px] leading-tight text-slate-400">
                  +{t.categories.length + t.extraCategoryCount - 1} kategori
                </span>
              ) : null}
            </>
          ) : (
            <span className="mt-1 block text-[13px] leading-tight text-slate-300">
              —
            </span>
          )}
        </div>

        {/* 9 — Durum rozeti (md+) — yatay: dikey (writing-mode) sürüm kısa
            satırlarda kırpılıyordu ("rlendirmede"), etiket uzunluğu satır
            yüksekliğine bağlanamaz. */}
        <div className="hidden items-center px-1.5 py-1.5 md:flex">
          <span
            className={cn(
              "whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none ring-1",
              st.box,
            )}
          >
            {st.label}
          </span>
        </div>

        {/* 10 — Sağ uç metrik: Teklifler */}
        <div className="hidden flex-col items-end justify-center px-3 py-2.5 text-right xl:flex">
          <ColLabel>Teklifler</ColLabel>
          {t.bidCount > 0 ? (
            <Link
              href={detailHref}
              className={cn(
                "mt-0.5 rounded text-[13px] font-semibold leading-tight text-blue-600 hover:underline",
                IHALE_VIEW_FOCUS,
              )}
            >
              {t.bidCount}
            </Link>
          ) : (
            <span className="mt-0.5 text-[13px] leading-tight text-slate-400">
              -
            </span>
          )}
        </div>
      </div>

      {/* md altı: 2. satır — durum + tarih/teklif chip'leri */}
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-3 py-2 md:hidden">
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1",
            st.box,
          )}
        >
          {st.label}
        </span>
        <span className="text-[11px] text-slate-500">
          Kapanış:{" "}
          <span className={closeSoon ? "font-medium text-rose-600" : ""}>
            {shortDate(t.bidsCloseAt)}
          </span>
        </span>
        <span className="text-[11px] text-slate-500">
          Teklif: {t.bidCount > 0 ? t.bidCount : "-"}
        </span>
        {t.categories[0] ? (
          <span className="text-[11px] text-slate-500">
            {t.categories[0].name}
          </span>
        ) : null}
      </div>

      {/* Accordion — liste verisinin özeti + tembel kalem tablosu (yalnız
          açıkken fetch; ilk 5 kalem, tamamı detay sayfasında). */}
      {expanded ? (
        <div id={panelId} className="border-t border-slate-100 px-4 py-3">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-4">
            {(
              [
                ["Yayın", fullDate(t.publishedAt ?? t.createdAt) || "—"],
                ["Kapanış", fullDate(t.bidsCloseAt) || "—"],
                ["Davetli", String(t.invitationCount)],
                ["Teklif", String(t.bidCount)],
                [
                  "Usul",
                  t.format === "ENGLISH_AUCTION" ? "Pazarlık" : "Teklif Toplama",
                ],
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
                <dd className="text-[13px] leading-tight text-slate-700">
                  {v}
                </dd>
              </div>
            ))}
          </dl>
          <IhaleItemsPanel listingId={t.id} detailHref={detailHref} />
          <Link
            href={detailHref}
            className={cn(
              "mt-2 inline-block rounded text-[12px] font-medium text-blue-600 hover:underline",
              IHALE_VIEW_FOCUS,
            )}
          >
            Kalemler ve tüm detay →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
