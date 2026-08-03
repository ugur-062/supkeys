"use client";

import {
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from "@/components/catalyst/dropdown";
import type { SellerTenderRow } from "@/hooks/use-seller-tenders";
import {
  closingUrgency,
  daysUntil,
  deriveSellerTenderState,
} from "@/lib/tenders/seller-state";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  Building2,
  ChevronRight,
  Eye,
  FileText,
  Gavel,
  Link2,
  Lock,
  MoreHorizontal,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { DaysLeftChip, IHALE_VIEW_FOCUS, InfoChip } from "./IhaleListRow";

/**
 * Başkalarının ihaleleri için yoğun SATIR görünümü (Açık İhaleler / Satın Al)
 * — İhalelerim'deki IhaleListRow ile aynı görsel dil; fark: talep sahibi
 * kişi değil FİRMA (owner.name; maskeli listede "Gizli firma · Premium") ve
 * sağ uç metrik benim teklifim. Kart görünümü kaldırıldı (tek görünüm bu,
 * kullanıcı isteği 2026-08-03). Rozet kalabalığı (davet/bağlantı/kategori/
 * taban/hemen-al) genişletme satırında.
 */

function shortDate(iso: string | null): string {
  return iso ? format(new Date(iso), "d MMM", { locale: tr }) : "—";
}
function fullDate(iso: string | null): string {
  return iso ? format(new Date(iso), "d MMMM yyyy HH:mm", { locale: tr }) : "";
}

function ColLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="block text-[10px] font-medium uppercase tracking-wide leading-tight text-slate-400">
      {children}
    </span>
  );
}

/** Benim teklifim → kısa etiket (sağ uç metrik). */
function myBidLabel(t: SellerTenderRow): string | null {
  if (!t.myBidStatus) return null;
  const base =
    t.myBidStatus === "SUBMITTED"
      ? "Verildi"
      : t.myBidStatus === "WON" || t.myBidStatus === "AWARDED_PARTIAL"
        ? "Kazandın"
        : t.myBidStatus === "LOST"
          ? "Kaybedildi"
          : t.myBidStatus === "DRAFT"
            ? "Taslak"
            : t.myBidStatus;
  return t.myBidVersion && t.myBidVersion > 1 ? `${base} · v${t.myBidVersion}` : base;
}

export function BrowseTenderRow({
  t,
  listingType,
}: {
  t: SellerTenderRow;
  /** SATIS = Satın Al sayfası (mor aksan), ALIM = Açık İhaleler (yeşil). */
  listingType: "ALIM" | "SATIS";
}) {
  const [expanded, setExpanded] = useState(false);
  const isSatis = listingType === "SATIS";
  const state = deriveSellerTenderState(t.status, t.myBidStatus, t.invited);
  const urgency = closingUrgency(t.status, t.closesAt);

  const fromHref = isSatis
    ? "/company/satinalma/satin-al"
    : "/company/satis/acik-ihaleler";
  const fromLabel = isSatis ? "Satın Al" : "Açık İhaleler";
  const detailHref = `/company/ilan/${t.id}?from=${encodeURIComponent(fromHref)}&fromLabel=${encodeURIComponent(fromLabel)}`;

  const strip =
    t.status !== "OPEN"
      ? "border-l-slate-400"
      : t.myBidStatus
        ? "border-l-blue-500"
        : t.invited
          ? "border-l-amber-500"
          : "border-l-emerald-500";

  const copyLink = () => {
    navigator.clipboard
      .writeText(`${window.location.origin}/company/ilan/${t.id}`)
      .then(() => toast.success("Bağlantı kopyalandı"))
      .catch(() => toast.error("Kopyalanamadı"));
  };

  const primaryAction =
    t.status === "OPEN" && t.canBid && !t.myBidStatus
      ? { icon: Gavel, label: "Teklif Ver", href: detailHref }
      : t.myBidStatus
        ? { icon: Gavel, label: "Teklifimi Gör", href: detailHref }
        : { icon: Eye, label: "Detaya Git", href: detailHref };

  const my = myBidLabel(t);

  return (
    <div
      role="row"
      className={cn(
        "rounded-lg border-l-[3px] bg-white ring-1 ring-slate-200 transition-all hover:shadow-sm hover:ring-slate-300",
        strip,
      )}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-stretch xl:grid-cols-[auto_minmax(280px,2fr)_1.3fr_0.8fr_0.9fr_1fr_1.1fr_auto_auto] xl:divide-x xl:divide-slate-100">
        {/* 1 — Genişlet (md+) */}
        <div className="hidden items-center px-3 py-2.5 md:flex">
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            aria-label={expanded ? "Detayı gizle" : "Detayı genişlet"}
            className={cn("rounded text-slate-400", IHALE_VIEW_FOCUS)}
          >
            <ChevronRight
              className={cn("h-4 w-4 transition-transform", expanded && "rotate-90")}
              aria-hidden
            />
          </button>
        </div>

        {/* 2 — Kimlik + başlık */}
        <div className="min-w-0 px-3 py-2.5">
          <div className="flex items-start gap-2">
            <FileText
              className={cn(
                "mt-0.5 h-4 w-4 shrink-0",
                isSatis ? "text-violet-500" : "text-emerald-500",
              )}
              aria-hidden
            />
            <Link
              href={detailHref}
              className={cn("min-w-0 rounded", IHALE_VIEW_FOCUS)}
            >
              <span className="block text-[11px] leading-tight text-slate-400">
                İhale {t.number ?? "—"}
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

        {/* 3 — Firma (xl) — başkasının ihalesinde talep sahibi ŞİRKETTİR.
            Görsel hiyerarşi: ikon çipi + koyu yarı-kalın ad (satırın ikinci
            en önemli bilgisi). */}
        <div className="hidden min-w-0 px-3 py-2.5 xl:block">
          <ColLabel>Firma</ColLabel>
          {t.owner ? (
            <span className="mt-1 flex min-w-0 items-center gap-1.5">
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-md",
                  isSatis ? "bg-violet-50" : "bg-emerald-50",
                )}
              >
                <Building2
                  className={cn(
                    "h-3 w-3",
                    isSatis ? "text-violet-600" : "text-emerald-600",
                  )}
                  aria-hidden
                />
              </span>
              <span
                className="truncate text-[13px] font-semibold leading-tight text-slate-900"
                title={t.owner.name}
              >
                {t.owner.name}
              </span>
            </span>
          ) : (
            <span className="mt-1 flex items-center gap-1.5">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-amber-50">
                <Lock className="h-3 w-3 text-amber-500" aria-hidden />
              </span>
              <span className="truncate text-[13px] italic leading-tight text-slate-500">
                Gizli firma
              </span>
              <InfoChip tone="amber">Premium</InfoChip>
            </span>
          )}
        </div>

        {/* 4 — Kalem + para birimi (lg+) — sayı büyük/koyu, birim çipte. */}
        <div className="hidden px-3 py-2.5 lg:block">
          <ColLabel>Kalem</ColLabel>
          <span className="mt-0.5 flex items-baseline gap-1">
            <span className="text-[15px] font-semibold tabular-nums leading-tight text-slate-900">
              {t.itemCount}
            </span>
            <span className="text-[11px] text-slate-400">kalem</span>
          </span>
          <span className="mt-1 inline-flex rounded border border-slate-200 bg-white px-1 py-px font-mono text-[10px] font-semibold text-slate-500">
            {t.currency}
          </span>
        </div>

        {/* 5 — Kapsam + usul (lg+) — çip'lerle ayrım (uluslararası yeşil,
            pazarlık mor; sıradan değerler nötr). */}
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

        {/* 6 — Kapanış (md+) — tarih koyu, kalan süre renkli çip. */}
        <div className="hidden px-3 py-2.5 md:block">
          <ColLabel>Kapanış tarihi</ColLabel>
          <span
            className={cn(
              "mt-0.5 block text-[13px] font-semibold leading-tight",
              urgency && (daysUntil(t.closesAt) ?? 99) <= 3
                ? urgency.className
                : "text-slate-900",
            )}
            title={fullDate(t.closesAt)}
          >
            {shortDate(t.closesAt)}
          </span>
          <span className="mt-1 block">
            <DaysLeftChip status={t.status} closesAt={t.closesAt} />
          </span>
        </div>

        {/* 7 — Aksiyonlar (xl: dikey yığın) */}
        <div className="hidden px-3 py-2.5 xl:block">
          <div className="flex flex-col gap-1.5">
            <Link
              href={primaryAction.href}
              className={cn(
                "inline-flex items-center gap-1.5 rounded text-[12px] leading-tight text-slate-700 hover:underline",
                IHALE_VIEW_FOCUS,
              )}
            >
              <primaryAction.icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {primaryAction.label}
            </Link>
            <button
              type="button"
              onClick={copyLink}
              className={cn(
                "inline-flex items-center gap-1.5 rounded text-[12px] leading-tight text-slate-700 hover:underline",
                IHALE_VIEW_FOCUS,
              )}
            >
              <Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Bağlantıyı kopyala
            </button>
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

        {/* 8 — Dikey durum rozeti (md+) — davet/teklif durumuna göre. */}
        <div className="hidden items-stretch px-1.5 py-1.5 md:flex">
          <span
            className={cn(
              "flex w-8 items-center justify-center rounded border text-[10px] font-semibold leading-none",
              "[writing-mode:vertical-rl] rotate-180",
              state.className,
            )}
          >
            {state.label}
          </span>
        </div>

        {/* 9 — Sağ uç metrik: Teklifim */}
        <div className="hidden flex-col items-end justify-center px-3 py-2.5 text-right xl:flex">
          <ColLabel>Teklifim</ColLabel>
          {my ? (
            <Link
              href={detailHref}
              className={cn(
                "mt-0.5 whitespace-nowrap rounded text-[13px] font-semibold leading-tight text-blue-600 hover:underline",
                IHALE_VIEW_FOCUS,
              )}
            >
              {my}
            </Link>
          ) : (
            <span className="mt-0.5 text-[13px] leading-tight text-slate-400">-</span>
          )}
        </div>
      </div>

      {/* md altı: 2. satır — durum + kapanış + teklifim chip'leri */}
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-3 py-2 md:hidden">
        <span
          className={cn(
            "rounded border px-1.5 py-0.5 text-[10px] font-semibold",
            state.className,
          )}
        >
          {state.label}
        </span>
        <span className="text-[11px] text-slate-500">
          {t.owner ? t.owner.name : "Gizli firma"}
        </span>
        <span className="text-[11px] text-slate-500">
          Kapanış: {shortDate(t.closesAt)}
        </span>
        {my ? <span className="text-[11px] text-slate-500">Teklifim: {my}</span> : null}
      </div>

      {/* Accordion — rozet kalabalığı burada (davet/bağlantı/kategori/fiyat). */}
      {expanded ? (
        <div className="border-t border-slate-100 px-4 py-3">
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
                Kategorine Uygun
              </span>
            ) : null}
            {isSatis && t.priceScope === "KALEM" ? (
              <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-700">
                Kalem Bazlı Fiyat
              </span>
            ) : null}
            {isSatis && t.minPrice ? (
              <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-emerald-700">
                Taban {Number(t.minPrice).toLocaleString("tr-TR")}
              </span>
            ) : null}
            {isSatis && t.buyNowPrice ? (
              <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-amber-700">
                Hemen-Al {Number(t.buyNowPrice).toLocaleString("tr-TR")}
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
                [
                  "Usul",
                  t.format === "ENGLISH_AUCTION" ? "Pazarlık" : "Teklif Toplama",
                ],
              ] as const
            ).map(([k, v]) => (
              <div key={k}>
                <dt className="text-[11px] text-slate-400">{k}</dt>
                <dd className="text-[13px] leading-tight text-slate-700">{v}</dd>
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
