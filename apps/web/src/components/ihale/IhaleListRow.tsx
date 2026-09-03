"use client";

import { formatDate } from "@/lib/format-date";
import { MODULE_LABELS } from "@/lib/company/portals";
import { IhaleItemsPanel } from "./IhaleItemsPanel";
import type { TenderListItem } from "@/hooks/use-company-tenders";
import { closingUrgency, daysUntil } from "@/lib/tenders/seller-state";
import { cn } from "@/lib/utils";
import { differenceInCalendarDays } from "date-fns";
import { ChevronDown, FileText, Star } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

// B9: tek tarih dili — kanonik formatlayıcı (yıl her yerde görünür).
const shortDate = (iso: string | null) => formatDate(iso, "short");
const fullDate = (iso: string | null) => formatDate(iso, "datetime");

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
  const router = useRouter();
  const isSatis = listingType === "SATIS";
  const st = statusStyle(t.status);
  const panelId = `listing-row-detay-${t.id}`;

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

  /**
   * TÜM KART TIKLANIR (2026-09-03): soldaki "›" oku kalktı, hedefi kart
   * hover'ı söyler. Başlık gerçek bir bağlantı olarak kalır (orta tık,
   * klavye); kart üstündeki diğer etkileşimler (favori, kalemler, açılan
   * panel) yayılımı keser — yoksa favoriye tıklamak sayfayı değiştirirdi.
   */
  const go = () => router.push(detailHref);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  const statusBadge = (
    <span
      className={cn(
        "whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none ring-1",
        st.box,
      )}
    >
      {st.label}
    </span>
  );

  // Kalem önizlemesi (tembel) — ok yerine adlı düğme; ne açtığı belli olsun.
  const itemsToggle = (
    <button
      type="button"
      onClick={(e) => {
        stop(e);
        setExpanded((v) => !v);
      }}
      aria-expanded={expanded}
      aria-controls={panelId}
      className={cn(
        "inline-flex items-center gap-0.5 rounded text-[11px] font-medium text-slate-500 hover:text-slate-900",
        IHALE_VIEW_FOCUS,
      )}
    >
      Kalemler
      <ChevronDown
        className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")}
        aria-hidden
      />
    </button>
  );

  // Kimlik + başlık — iki düzende de AYNI blok (kod üstte, ad altında).
  const heading = (
    <div className="flex min-w-0 items-start gap-2">
      <div className="flex shrink-0 flex-col items-center gap-1 pt-0.5">
        <FileText
          className={cn("h-4 w-4", isSatis ? "text-emerald-500" : "text-blue-500")}
          aria-hidden
        />
        <button
          type="button"
          onClick={(e) => {
            stop(e);
            onToggleFavorite(t.id);
          }}
          aria-label={favorite ? "Favorilerden çıkar" : "Favorilere ekle"}
          aria-pressed={favorite}
          className={cn("rounded", IHALE_VIEW_FOCUS)}
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
      <Link
        href={detailHref}
        onClick={stop}
        className={cn("min-w-0 rounded", IHALE_VIEW_FOCUS)}
      >
        <span className="inline-flex rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] tabular-nums leading-tight text-zinc-600">
          {t.tenderNumber}
        </span>
        <span
          className={cn(
            "mt-1 line-clamp-2 text-[13px] font-semibold leading-tight text-slate-900 transition-colors",
            isSatis ? "group-hover/row:text-emerald-700" : "group-hover/row:text-blue-700",
          )}
          title={t.title}
        >
          {t.title}
        </span>
      </Link>
    </div>
  );

  const scopeChips = (
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
  );

  return (
    <div
      role="row"
      onClick={go}
      className={cn(
        "group/row cursor-pointer rounded-lg border-l-[3px] bg-white ring-1 ring-slate-200 transition-all hover:shadow-sm hover:ring-slate-300",
        st.strip,
      )}
    >
      {/* xl+: yoğun tablo satırı (kullanıcı isteği 2026-08-03 — tek görünüm).
          Seçim kolonu ve "›" oku YOK. */}
      <div className="hidden xl:grid xl:grid-cols-[minmax(280px,2fr)_1.2fr_0.9fr_0.9fr_1.1fr_1.1fr_auto_auto] xl:items-stretch xl:divide-x xl:divide-slate-100">
        <div className="min-w-0 px-3 py-2.5">{heading}</div>

        {/* Talep sahibi. "Detayı aç" linki KALDIRILDI (çiftti: başlık zaten
            detay linki + sağda duruma göre birincil aksiyon var). */}
        <div className="min-w-0 px-3 py-2.5">
          <ColLabel>{isSatis ? "Satışçı" : "Satın Almacı"}</ColLabel>
          <span
            className="mt-1 block truncate text-[13px] font-semibold leading-tight text-slate-900"
            title={`${t.createdBy.firstName} ${t.createdBy.lastName}`}
          >
            {t.createdBy.firstName} {t.createdBy.lastName}
          </span>
        </div>

        {/* Davetli — sayı büyük/koyu; 0 davetli soluk kalır. */}
        <div className="px-3 py-2.5">
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

        {/* Kapsam — çip'lerle ayrım (uluslararası yeşil, pazarlık mor). */}
        <div className="px-3 py-2.5">
          <ColLabel>Kapsam</ColLabel>
          <span className="mt-1 block">{scopeChips}</span>
        </div>

        {/* Tarihler — kapanış koyu + kalan süre renkli çip. */}
        <div className="px-3 py-2.5">
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

        {/* Kategori — aksiyonların yerine (kullanıcı isteği, 2026-08-04):
            satır zaten detaya tıklanıyor, işlemler detayda. */}
        <div className="min-w-0 px-3 py-2.5">
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
            <span className="mt-1 block text-[13px] leading-tight text-slate-300">—</span>
          )}
        </div>

        {/* Durum rozeti — yatay: dikey (writing-mode) sürüm kısa satırlarda
            kırpılıyordu ("rlendirmede"). */}
        <div className="flex items-center px-1.5 py-1.5">{statusBadge}</div>

        {/* Sağ uç metrik: Teklifler + kalem önizleme düğmesi */}
        <div className="flex flex-col items-end justify-center px-3 py-2.5 text-right">
          <ColLabel>Teklifler</ColLabel>
          {t.bidCount > 0 ? (
            <Link
              href={detailHref}
              onClick={stop}
              className={cn(
                "mt-0.5 rounded text-[13px] font-semibold leading-tight text-blue-600 hover:underline",
                IHALE_VIEW_FOCUS,
              )}
            >
              {t.bidCount}
            </Link>
          ) : (
            <span className="mt-0.5 text-[13px] tabular-nums leading-tight text-slate-400">
              0
            </span>
          )}
          <span className="mt-1">{itemsToggle}</span>
        </div>
      </div>

      {/* xl altı: KART — bilgi sırası SABİT (2026-09-03): kod + ad üstte,
          durum rozeti adla aynı satırda sağda, altta 4 sütun Davetli /
          Kapsam / Yayın / Kapanış. Eskiden iki kolonlu ızgara sütunları
          rastgele akıtıyordu (başlık sağa, rozet alta düşüyordu). */}
      <div className="px-3 py-2.5 xl:hidden">
        <div className="flex items-start justify-between gap-3">
          {heading}
          <span className="shrink-0 pt-0.5">{statusBadge}</span>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
          <div>
            <dt>
              <ColLabel>Davetli</ColLabel>
            </dt>
            <dd
              className={cn(
                "mt-0.5 text-[13px] font-semibold tabular-nums leading-tight",
                t.invitationCount > 0 ? "text-slate-900" : "text-slate-300",
              )}
            >
              {t.invitationCount}
            </dd>
          </div>
          <div>
            <dt>
              <ColLabel>Kapsam</ColLabel>
            </dt>
            <dd className="mt-1">{scopeChips}</dd>
          </div>
          <div>
            <dt>
              <ColLabel>Yayın</ColLabel>
            </dt>
            <dd
              className="mt-0.5 text-[13px] leading-tight text-slate-500"
              title={fullDate(t.publishedAt ?? t.createdAt)}
            >
              {shortDate(t.publishedAt ?? t.createdAt)}
            </dd>
          </div>
          <div>
            <dt>
              <ColLabel>Kapanış</ColLabel>
            </dt>
            <dd
              className={cn(
                "mt-0.5 text-[13px] font-semibold leading-tight",
                closeSoon ? "text-rose-600" : "text-slate-900",
              )}
              title={fullDate(t.bidsCloseAt)}
            >
              {shortDate(t.bidsCloseAt)}
              <span className="mt-1 block">
                <DaysLeftChip status={t.status} closesAt={t.bidsCloseAt} />
              </span>
            </dd>
          </div>
        </dl>
        <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-slate-500">
          <span className="truncate">
            Teklif: {t.bidCount}
            {t.categories[0] ? ` · ${t.categories[0].name}` : ""}
          </span>
          {itemsToggle}
        </div>
      </div>

      {/* Accordion — liste verisinin özeti + tembel kalem tablosu (yalnız
          açıkken fetch; ilk 5 kalem, tamamı detay sayfasında). Panel içi
          tıklama kartı açmaz. */}
      {expanded ? (
        <div id={panelId} onClick={stop} className="border-t border-slate-100 px-4 py-3">
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
          <IhaleItemsPanel listingId={t.id} detailHref={detailHref} itemsTab={2} />
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
