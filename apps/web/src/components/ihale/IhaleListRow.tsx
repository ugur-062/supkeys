"use client";

import type { TenderListItem } from "@/hooks/use-company-tenders";
import { cn } from "@/lib/utils";
import { differenceInCalendarDays, format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  ChevronRight,
  Eye,
  FileText,
  Gavel,
  HelpCircle,
  Link2,
  MoreHorizontal,
  Pencil,
  Star,
} from "lucide-react";
import {
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from "@/components/catalyst/dropdown";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

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
    <span className="block text-[11px] leading-tight text-slate-400">
      {children}
    </span>
  );
}

function RowAction({
  icon: Icon,
  label,
  href,
  onClick,
  tone = "text-slate-700",
}: {
  icon: typeof Eye;
  label: string;
  href?: string;
  onClick?: () => void;
  tone?: string;
}) {
  const cls = cn(
    "inline-flex items-center gap-1.5 rounded text-[12px] leading-tight hover:underline",
    tone,
    IHALE_VIEW_FOCUS,
  );
  const inner = (
    <>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {label}
    </>
  );
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

export interface IhaleListRowProps {
  t: TenderListItem;
  listingType: "ALIM" | "SATIS";
  selected: boolean;
  onToggleSelect: (id: string) => void;
  favorite: boolean;
  onToggleFavorite: (id: string) => void;
}

export function IhaleListRow({
  t,
  listingType,
  selected,
  onToggleSelect,
  favorite,
  onToggleFavorite,
}: IhaleListRowProps) {
  const [expanded, setExpanded] = useState(false);
  const isSatis = listingType === "SATIS";
  const st = statusStyle(t.status);

  const fromHref = isSatis
    ? "/company/satis/ilanlarim"
    : "/company/satinalma/ihalelerim";
  const fromLabel = isSatis ? "Satış İhalelerim" : "İhalelerim";
  const detailHref = `/company/ilan/${t.id}?from=${encodeURIComponent(fromHref)}&fromLabel=${encodeURIComponent(fromLabel)}`;
  const editHref = isSatis
    ? `/company/satis/ilanlarim/${t.id}/duzenle`
    : `/company/satinalma/ihalelerim/${t.id}/duzenle`;

  // Kapanışa < 3 gün → tarih vurgusu (yalnız açık ihalede).
  const closeSoon =
    t.status === "OPEN" &&
    !!t.bidsCloseAt &&
    differenceInCalendarDays(new Date(t.bidsCloseAt), new Date()) < 3;

  const copyLink = () => {
    navigator.clipboard
      .writeText(`${window.location.origin}/company/ilan/${t.id}`)
      .then(() => toast.success("Bağlantı kopyalandı"))
      .catch(() => toast.error("Kopyalanamadı"));
  };

  // Duruma göre 2'li aksiyon yığını (referans akış uyarlaması).
  const primaryAction =
    t.status === "DRAFT"
      ? { icon: Pencil, label: "Düzenle", href: editHref }
      : t.status === "AWARDED"
        ? { icon: Gavel, label: "Sonucu Gör", href: detailHref }
        : t.bidCount > 0
          ? { icon: Gavel, label: "Teklifleri Gör", href: detailHref }
          : { icon: Eye, label: "Detaya Git", href: detailHref };

  return (
    <div
      role="row"
      aria-selected={selected}
      className={cn(
        "rounded-lg border-l-[3px] bg-white ring-1 ring-slate-200 transition-all hover:shadow-sm hover:ring-slate-300",
        st.strip,
        selected && "ring-blue-300",
      )}
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-stretch xl:grid-cols-[auto_auto_minmax(280px,2fr)_1.2fr_0.9fr_0.9fr_1.1fr_1.1fr_auto_auto] xl:divide-x xl:divide-slate-100">
        {/* 1 — Seçim */}
        <div className="flex items-center px-3 py-2.5">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(t.id)}
            aria-label={`${t.tenderNumber} seç`}
            className={cn(
              "h-4 w-4 rounded border-slate-300 text-blue-600",
              IHALE_VIEW_FOCUS,
            )}
          />
        </div>

        {/* 2 — Genişlet (md+) */}
        <div className="hidden items-center px-3 py-2.5 md:flex">
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
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
              <FileText className="h-4 w-4 text-blue-500" aria-hidden />
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
              <span className="block text-[11px] leading-tight text-slate-400">
                İhale {t.tenderNumber}
              </span>
              <span
                className="mt-0.5 line-clamp-2 text-[13px] font-semibold leading-tight text-slate-900"
                title={t.title}
              >
                “{t.title}”
              </span>
            </Link>
          </div>
        </div>

        {/* 4 — Talep sahibi (xl) */}
        <div className="hidden min-w-0 px-3 py-2.5 xl:block">
          <ColLabel>{isSatis ? "Satışçı" : "Satın Almacı"}</ColLabel>
          <span className="mt-0.5 block truncate text-[13px] leading-tight text-slate-700">
            {t.createdBy.firstName} {t.createdBy.lastName}
          </span>
          <Link
            href={detailHref}
            className={cn(
              "mt-0.5 inline-block rounded text-[11px] leading-tight text-blue-600 hover:underline",
              IHALE_VIEW_FOCUS,
            )}
          >
            Detayı aç
          </Link>
        </div>

        {/* 5 — Davetli (lg+) */}
        <div className="hidden px-3 py-2.5 lg:block">
          <ColLabel>Davetli</ColLabel>
          <span className="mt-0.5 block text-[13px] leading-tight text-slate-700">
            {t.invitationCount}
          </span>
        </div>

        {/* 6 — Kapsam (lg+) */}
        <div className="hidden px-3 py-2.5 lg:block">
          <ColLabel>Kapsam</ColLabel>
          <span
            className={cn(
              "mt-0.5 block text-[13px] leading-tight",
              t.isInternational
                ? "font-medium text-emerald-600"
                : "text-slate-500",
            )}
          >
            {t.isInternational ? "Uluslararası" : "Yurtiçi"}
          </span>
          <span className="mt-0.5 block text-[11px] leading-tight text-slate-400">
            {t.format === "ENGLISH_AUCTION" ? "Pazarlık" : "Teklif Toplama"}
          </span>
        </div>

        {/* 7 — Tarihler (md+) */}
        <div className="hidden px-3 py-2.5 md:block">
          <ColLabel>Yayın tarihi</ColLabel>
          <span
            className="mt-0.5 block text-[13px] leading-tight text-slate-700"
            title={fullDate(t.publishedAt ?? t.createdAt)}
          >
            {shortDate(t.publishedAt ?? t.createdAt)}
          </span>
          <ColLabel>Kapanış tarihi</ColLabel>
          <span
            className={cn(
              "mt-0.5 block text-[13px] leading-tight",
              closeSoon ? "font-medium text-rose-600" : "text-slate-700",
            )}
            title={fullDate(t.bidsCloseAt)}
          >
            {shortDate(t.bidsCloseAt)}
          </span>
        </div>

        {/* 8 — Aksiyonlar (xl: dikey yığın) */}
        <div className="hidden px-3 py-2.5 xl:block">
          <div className="flex items-start gap-1.5">
            <div className="flex flex-col gap-1.5">
              <RowAction
                icon={primaryAction.icon}
                label={primaryAction.label}
                href={primaryAction.href}
              />
              <RowAction icon={Link2} label="Bağlantıyı kopyala" onClick={copyLink} />
            </div>
            <span
              title="Aksiyonlar ihalenin durumuna göre değişir; tüm işlemler detay sayfasında."
              aria-label="Aksiyonlar hakkında bilgi"
            >
              <HelpCircle className="h-3.5 w-3.5 text-slate-300" aria-hidden />
            </span>
          </div>
        </div>

        {/* md ve altı: aksiyonlar "…" menüsünde */}
        <div className="flex items-center px-2 py-2.5 xl:hidden">
          <Dropdown>
            <DropdownButton
              plain
              aria-label="Aksiyonlar"
              className={cn("!p-1.5", IHALE_VIEW_FOCUS)}
            >
              <MoreHorizontal className="h-4 w-4 text-slate-400" />
            </DropdownButton>
            <DropdownMenu anchor="bottom end">
              <DropdownItem href={primaryAction.href}>
                <DropdownLabel>{primaryAction.label}</DropdownLabel>
              </DropdownItem>
              <DropdownItem onClick={copyLink}>
                <DropdownLabel>Bağlantıyı kopyala</DropdownLabel>
              </DropdownItem>
            </DropdownMenu>
          </Dropdown>
        </div>

        {/* 9 — Dikey durum rozeti (md+) */}
        <div className="hidden items-stretch px-1.5 py-1.5 md:flex">
          <span
            className={cn(
              "flex w-8 items-center justify-center rounded ring-1 text-[10px] font-semibold leading-none",
              "[writing-mode:vertical-rl] rotate-180",
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
      </div>

      {/* Accordion — mevcut liste verisinin özeti (kalem verisi listede yok;
          tam kalemler detay sayfasında). */}
      {expanded ? (
        <div className="border-t border-slate-100 px-4 py-3">
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
                ["Kategori", `${t.categoryIds.length} kategori`],
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
