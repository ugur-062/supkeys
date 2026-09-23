"use client";

import { Badge } from "@/components/catalyst/badge";
import { formatDate } from "@/lib/format-date";
import type { PublicListingCard } from "@/lib/public/marketplace-api";
import {
  listingHref,
  publicState,
  type PublicListingState,
} from "@/lib/public/marketplace";
import { cn } from "@/lib/utils";
import { useScopeLabel } from "@/i18n/domain";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import {
  CalendarDaysIcon,
  DocumentTextIcon,
  InformationCircleIcon,
  PaperAirplaneIcon,
  TagIcon,
  UsersIcon,
} from "@heroicons/react/20/solid";
import { accentFillClass, useButtonAccent } from "@/components/ui/button-accent";
import {
  BuildingOffice2Icon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClockIcon,
  GlobeAltIcon,
  MapPinIcon,
} from "@heroicons/react/20/solid";
import { Link } from "@/i18n/navigation";
import { useRouter } from "@/i18n/navigation";
import { useState, type ReactNode } from "react";

/**
 * Durum rengi Catalyst `Badge` paletinden. Marka monokrom (globals.css
 * `@theme` mavi tonları bilinçle zinc'e map ediyor), o yüzden RENK yalnız
 * DURUM anlatır: yeşil = teklif alınıyor, kehribar = karar aşamasında,
 * gri = bitti.
 */
const STATE_COLOR: Record<PublicListingState, "emerald" | "amber" | "zinc"> = {
  open: "emerald",
  evaluating: "amber",
  closed: "zinc",
};

/**
 * İLAN KARTI — TEK bileşen ailesi (v2 denetimi, 2026-09-03).
 *
 * Aynı kayıt (ilan/talep) üç ayrı kartla çiziliyordu: pano tile'ı (16:9 dev
 * görsel alanı, içinde kategori ampulü), başkalarının satırı
 * (BrowseTenderRow), kendi satırı (IhaleListRow) — ve her biri görseli
 * farklı ele alıyordu. Şimdi:
 *
 *  · `variant="tile"` — pano / keşif. GÖRSEL KURALI: `kind="talep"` (satın
 *    alma talebi) için görsel alanı HİÇ ayrılmaz — alıcı fotoğraf yüklemez,
 *    ihtiyacını "Dosya Ekle"yle tarif eder; kart kategori ikonu + metin.
 *    `kind="ilan"` (satış ilanı) için kapak VARSA 4:3 kapak, yoksa aynı
 *    kompakt kart. Panoda dev placeholder kalmaz.
 *  · `variant="row"` — listeler: kod + ad sol üst, durum rozeti aynı satır
 *    sağda, altta sabit sütunlar (facts), sağ altta metrik/eylem, "Kalemler"
 *    açılır paneli. Tüm satır tıklanır.
 *
 * Veri normalize edilmiş `ListingCardData` — kendi ilanı (TenderListItem) ve
 * başkasının ilanı (SellerTenderRow) adaptörlerle buraya iner; kolon KÜMESİ
 * adaptörün işi, DÜZEN buranın. Herkese açık pazar yeri kartı (`listing`
 * prop'u) aynı dosyada: orada kategori görseli bilinçli (SEO yüzeyi, "gri
 * kutu yok" kararı) — panel kuralı oraya uygulanmaz.
 */
export interface ListingCardData {
  id: string;
  href: string;
  number: string | null;
  title: string;
  /** "ilan" = kapak taşıyabilen kayıt (tarihsel; satış ilanı kaldırıldı), "talep" = asla görsel. */
  kind: "ilan" | "talep";
  coverImageUrl?: string | null;
  categoryIds: string[];
  status: { label: string; className: string };
  /** Sol kenar rengi (row). */
  strip?: string;
  /** Başlık altı rozetler (davet, eşleşme, bağlantı, paket…). */
  chips?: ReactNode;
  /** Tile: firma · şehir · kalem sayısı satırı. */
  subtitle?: string | null;
  /** Sabit sütunlar — sırayla. `icon` verilmezse etiketten (Türkçe) sezilir. */
  facts: { label: string; value: ReactNode; icon?: FactIcon }[];
  /** Sağ alt metrik (Teklifler / Teklifim). */
  metric?: { label: string; value: ReactNode } | null;
  /** Sağ alt eylem bağlantısı ("Teklif ver"). */
  action?: { label: string; href: string } | null;
  /** Durumun yanında zaman notu ("Süresi doldu · 6 gün önce", "3 gün kaldı"). */
  timeNote?: string | null;
  /** Row: soldaki küçük kontrol (favori yıldızı). */
  leading?: ReactNode;
  /** Row: "Kalemler" açılır paneli. */
  expandable?: { id: string; render: () => ReactNode } | null;
  /** Row: sağ üst ⋮ menüsü (isteğe bağlı). */
  menu?: ReactNode;
}

/** Sütun ikonu — etiket dilden bağımsız (i18n Faz 1: EN/RU etiket sezgiseli kırmasın). */
export type FactIcon = "closing" | "company" | "items" | "scope" | "category" | "people" | "info";

export const ROW_FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

export function ListingCard({
  listing,
  data,
  variant = "tile",
  dense = false,
  imageMode = "cover-only",
  className,
}: {
  /** Herkese açık pazar yeri kartı (sunucu bileşenlerinden). */
  listing?: PublicListingCard;
  /** Panel kartı — normalize veri. */
  data?: ListingCardData;
  variant?: "tile" | "row";
  /** Row: tek satır özet (pano widget'ı) — sütun ızgarası ve panel yok. */
  dense?: boolean;
  /**
   * `cover-only` (panel): görsel yalnız ilan + kapak varsa.
   * `category` (pazar yeri): kapak yoksa üretilmiş kategori görseli.
   */
  imageMode?: "cover-only" | "category";
  className?: string;
}) {
  if (listing) return <PublicTile listing={listing} />;
  if (!data) return null;
  return variant === "row" ? (
    <PanelRow data={data} dense={dense} className={className} />
  ) : (
    <PanelTile data={data} imageMode={imageMode} className={className} />
  );
}

/* ------------------------------------------------------------------ */
/* PANEL — tile                                                         */
/* ------------------------------------------------------------------ */

function PanelTile({
  data: d,
  imageMode,
  className,
}: {
  data: ListingCardData;
  imageMode: "cover-only" | "category";
  className?: string;
}) {
  /* KATEGORİ GÖRSELİ/İKONU YOK (2026-09-18, kullanıcı kararı: "taleplerde
     hiçbir yerde kategori bandı olmasın"). Kart yalnız numara + başlık +
     sütunlarla başlar; `imageMode` geriye dönük uyumluluk için duruyor. */
  void imageMode;
  return (
    <Link
      href={d.href}
      className={cn(
        "group flex h-full flex-col overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-zinc-950/5 transition hover:-translate-y-0.5 hover:shadow-md hover:ring-zinc-950/10",
        className,
      )}
    >
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start gap-2.5">
          <div className="min-w-0 flex-1">
            <span className="inline-flex rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] tabular-nums leading-tight text-zinc-600">
              {d.number ?? "—"}
            </span>
            <h3 className="mt-1 line-clamp-2 text-sm/5 font-semibold text-zinc-950">
              {d.title}
            </h3>
          </div>
        </div>
        {d.chips ? <div className="mt-2 flex flex-wrap gap-1.5">{d.chips}</div> : null}
        {d.subtitle ? (
          <p className="mt-1.5 line-clamp-1 text-xs text-zinc-500">{d.subtitle}</p>
        ) : null}
        <div className="mt-auto flex items-center justify-between gap-2 pt-3">
          <span
            className={cn(
              "whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-semibold leading-none",
              d.status.className,
            )}
          >
            {d.status.label}
          </span>
          {d.timeNote ? <span className="text-xs text-zinc-500">{d.timeNote}</span> : null}
        </div>
      </div>
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* PANEL — row                                                          */
/* ------------------------------------------------------------------ */

/** Sütun etiketi → ikon + ton (mockup 2026-09-19: her metrik ikon karosuyla). */
function factIcon(f: { label: string; icon?: FactIcon }): { Icon: typeof DocumentTextIcon; tone: string; value: string } {
  const l = f.label.toLocaleLowerCase("tr");
  const kind: FactIcon =
    f.icon ??
    (l.includes("kapan") ? "closing"
      : l.includes("firma") || l.includes("alıcı") || l.includes("sahib") ? "company"
      : l.includes("kalem") ? "items"
      : l.includes("kapsam") || l.includes("görünürlük") ? "scope"
      : l.includes("kategori") ? "category"
      : l.includes("davet") || l.includes("teklif") ? "people"
      : "info");
  switch (kind) {
    case "closing": return { Icon: CalendarDaysIcon, tone: "bg-rose-50 text-rose-600", value: "text-rose-600" };
    case "company": return { Icon: BuildingOffice2Icon, tone: "bg-slate-100 text-slate-600", value: "" };
    case "items": return { Icon: DocumentTextIcon, tone: "bg-slate-100 text-slate-600", value: "" };
    case "scope": return { Icon: MapPinIcon, tone: "bg-slate-100 text-slate-600", value: "" };
    case "category": return { Icon: TagIcon, tone: "bg-slate-100 text-slate-600", value: "text-blue-700" };
    case "people": return { Icon: UsersIcon, tone: "bg-slate-100 text-slate-600", value: "" };
    default: return { Icon: InformationCircleIcon, tone: "bg-slate-100 text-slate-600", value: "" };
  }
}

/**
 * TALEP SATIRI v3 (2026-09-19, kullanıcı mockup'ı "alım talep boxlarını bu
 * şekilde yap"): sol kenar portal renginde kalın şerit; başlıkta belge
 * ikonu karosu (portal tonu) + numara pili + büyük başlık + eşleşme çipleri;
 * sağ üstte durum pili (+ menü varsa ⋮). Metrik şeridi ikon karolu sütunlar
 * (Firma · Kalem · Kapsam · Kapanış · Kategori) dikey ayraçlarla; kapanış
 * kırmızı, kalan süre pil olarak altında. Altta "Detayları göster" oku ve
 * sağda büyük dolgulu "Teklif ver". `dense` (pano widget'ı) eski tek satır.
 */
function PanelRow({
  data: d,
  dense,
  className,
}: {
  data: ListingCardData;
  dense: boolean;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const router = useRouter();
  const accent = useButtonAccent();
  const t = useTranslations("web.marketplace.card");
  // TÜM SATIR tıklanır; başlık gerçek bağlantı (orta tık/klavye). Satır
  // üstündeki diğer etkileşimler yayılımı keser — favoriye tıklamak sayfayı
  // değiştirmesin.
  const go = () => router.push(d.href);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const tone =
    accent === "emerald"
      ? { strip: "border-l-emerald-500", tile: "bg-emerald-50 text-emerald-600" }
      : { strip: "border-l-blue-500", tile: "bg-blue-50 text-blue-600" };
  // Kalan süre notu Kapanış sütununun ALTINA pil olarak iner (mockup); o
  // sütun yoksa durumun yanında kalır.
  const closingIdx = d.facts.findIndex((f) => f.icon === "closing" || (!f.icon && f.label.toLocaleLowerCase("tr").includes("kapan")));
  const noteUnderClosing = !dense && closingIdx >= 0 && !!d.timeNote;

  if (dense) {
    return (
      <div
        onClick={go}
        data-liste-satiri="1"
        className={cn(
          "group/row cursor-pointer rounded-lg border-l-[3px] bg-white ring-1 ring-slate-200 transition-all hover:shadow-sm hover:ring-slate-300",
          d.strip ?? "border-l-slate-300",
          className,
        )}
      >
        <div className="px-3 py-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2">
              {d.leading}
              <Link href={d.href} onClick={stop} className={cn("min-w-0 rounded", ROW_FOCUS)}>
                <span className="inline-flex rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] tabular-nums leading-tight text-zinc-600">
                  {d.number ?? "—"}
                </span>
                <span className="mt-1 line-clamp-1 text-[13px] font-semibold leading-tight text-slate-900 transition-colors group-hover/row:text-slate-600" title={d.title}>
                  {d.title}
                </span>
              </Link>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1 pt-0.5">
              <span className={cn("whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-semibold leading-none", d.status.className)}>
                {d.status.label}
              </span>
              {d.timeNote ? <span className="whitespace-nowrap text-[10px] text-slate-600">{d.timeNote}</span> : null}
            </div>
          </div>
          <p className="mt-1 truncate text-[12px] text-slate-500">
            {d.facts.slice(0, 2).map((f, i) => (
              <span key={f.label}>
                {i > 0 ? " · " : ""}
                {f.value}
              </span>
            ))}
          </p>
          {d.metric || d.action ? (
            <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-slate-500">
              {d.metric ? (
                <span className="truncate">
                  {d.metric.label}: <span className="font-semibold text-slate-800">{d.metric.value}</span>
                </span>
              ) : <span />}
              {d.action ? (
                <Link href={d.action.href} onClick={stop} className={cn("inline-flex shrink-0 items-center rounded-lg px-3 py-1 text-xs font-semibold text-white shadow-sm", accentFillClass(accent), ROW_FOCUS)}>
                  {d.action.label}
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      /**
       * `role="row"` KALDIRILDI (2026-09-12 a11y taraması): satırın etrafında
       * tablo/ızgara bağlamı ve hücre çocuğu yok → `aria-required-children`
       * KRİTİK ihlali. Kart görsel bir satır; erişilebilir yol zaten içindeki
       * gerçek başlık bağlantısı.
       */
      onClick={go}
      data-liste-satiri="1"
      className={cn(
        "group/row cursor-pointer rounded-xl border-l-[3px] bg-white ring-1 ring-slate-200 transition-all hover:shadow-sm hover:ring-slate-300",
        d.strip ?? tone.strip,
        className,
      )}
    >
      {/* BOYUT ESKİ SATIRLA AYNI (2026-09-19, kullanıcı: "çok büyük yapmışsın,
          en eski boyutuyla aynı olsun"): px-3 py-2.5, başlık 13 px, etiket
          10 px, değer 13 px; ikon karoları küçük. */}
      <div className="px-3 py-2.5">
        {/* BAŞLIK */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            {d.leading}
            <span aria-hidden className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg", tone.tile)}>
              <DocumentTextIcon className="size-4" />
            </span>
            <Link href={d.href} onClick={stop} className={cn("min-w-0 rounded", ROW_FOCUS)}>
              <span className="inline-flex rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] tabular-nums leading-tight text-zinc-600">{d.number ?? "—"}</span>
              <span className="mt-1 line-clamp-2 text-[13px] font-semibold leading-tight text-slate-900 transition-colors group-hover/row:text-slate-600" title={d.title}>
                {d.title}
              </span>
              {d.chips ? <span className="mt-1 flex flex-wrap gap-1">{d.chips}</span> : null}
            </Link>
          </div>
          <div className="flex shrink-0 items-start gap-1">
            <div className="flex flex-col items-end gap-1 pt-0.5">
              <span className={cn("whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none", d.status.className)}>{d.status.label}</span>
              {d.timeNote && !noteUnderClosing ? <span className="whitespace-nowrap text-[10px] text-slate-600">{d.timeNote}</span> : null}
            </div>
            {d.menu ? <span onClick={stop}>{d.menu}</span> : null}
          </div>
        </div>

        {/* METRİK ŞERİDİ */}
        {d.facts.length > 0 ? (
          <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-slate-100 pt-2.5 sm:grid-cols-3 lg:grid-cols-5 lg:gap-y-0 lg:divide-x lg:divide-slate-100">
            {d.facts.map((f, i) => {
              const { Icon, tone: iconTone, value } = factIcon(f);
              return (
                // dl > div altında yalnız dt/dd olabilir (axe definition-list;
                // 2026-09-19 incelemesinde 240 düğüm): ikon dt'nin içinde,
                // değer satırları ikon genişliği kadar içeriden başlar.
                <div key={f.label} className={cn("min-w-0", i > 0 && "lg:pl-3")}>
                  <dt className="flex min-w-0 items-center gap-2 text-[10px] font-semibold uppercase tracking-wide leading-tight text-slate-600">
                    <span aria-hidden className={cn("flex size-7 shrink-0 items-center justify-center rounded-full", iconTone)}>
                      <Icon className="size-3.5" />
                    </span>
                    <span className="min-w-0">{f.label}</span>
                  </dt>
                  <dd className={cn("-mt-2 min-w-0 pl-9 text-[13px] font-semibold leading-tight text-slate-800", value)}>{f.value}</dd>
                  {noteUnderClosing && i === closingIdx ? (
                    <dd className="mt-1 ml-9 inline-flex items-center gap-1 rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-700">
                      <ClockIcon aria-hidden className="size-3" />
                      {d.timeNote}
                    </dd>
                  ) : null}
                </div>
              );
            })}
          </dl>
        ) : null}

        {/* ALT SATIR: detay oku solda, metrik ortada, eylem sağda */}
        {d.metric || d.action || d.expandable ? (
          <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-slate-500">
            <span className="flex min-w-0 items-center gap-4">
              {d.expandable ? (
                <button
                  type="button"
                  onClick={(e) => {
                    stop(e);
                    setExpanded((v) => !v);
                  }}
                  aria-expanded={expanded}
                  aria-controls={d.expandable.id}
                  aria-label={expanded ? t("hideItems") : t("showItems")}
                  className={cn("inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 text-[12px] text-slate-600 hover:bg-slate-100 hover:text-slate-900", ROW_FOCUS)}
                >
                  <ChevronDownIcon aria-hidden strokeWidth={2.25} className={cn("size-5 transition-transform", expanded && "rotate-180")} />
                  {expanded ? t("hideDetails") : t("showDetails")}
                </button>
              ) : null}
              {d.metric ? (
                <span className="truncate">
                  {d.metric.label}: <span className="font-semibold text-slate-800">{d.metric.value}</span>
                </span>
              ) : null}
            </span>
            {d.action ? (
              <Link
                href={d.action.href}
                onClick={stop}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-semibold text-white shadow-sm transition",
                  accentFillClass(accent),
                  ROW_FOCUS,
                )}
              >
                <PaperAirplaneIcon aria-hidden className="size-4 -rotate-45" />
                {d.action.label}
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>

      {expanded && d.expandable ? (
        <div id={d.expandable.id} onClick={stop} className="border-t border-slate-100 px-4 py-3">
          {d.expandable.render()}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* HERKESE AÇIK pazar yeri kartı (değişmedi)                            */
/* ------------------------------------------------------------------ */

function PublicTile({ listing }: { listing: PublicListingCard }) {
  const t = useTranslations("web.marketplace.card");
  const ts = useTranslations("web.marketplace.state");
  const locale = useLocale();
  const fmt = useFormatter();
  const scopeLabel = useScopeLabel();
  const state = publicState(listing.status);
  const href = listingHref(listing);
  const primaryCategory =
    listing.categories.find((c) => c.level >= 3) ?? listing.categories[0];

  return (
    <Link
      href={href}
      className="group flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-950/5 transition duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:ring-zinc-950/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950"
    >
      {/* Kategori görseli KALDIRILDI (2026-09-18, kullanıcı kararı). */}

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center justify-between gap-3">
          <Badge color={STATE_COLOR[state]}>
            {state === "open" ? (
              <span className="size-1.5 rounded-full bg-emerald-500" />
            ) : null}
            {ts(state)}
          </Badge>
          <ChevronRightIcon
            aria-hidden
            className="size-5 shrink-0 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-zinc-500"
          />
        </div>

        <h3 className="mt-3 line-clamp-2 text-base/6 font-semibold tracking-tight text-zinc-950">
          {listing.title}
        </h3>

        {listing.excerpt ? (
          <p className="mt-2 line-clamp-2 text-sm/6 text-zinc-500">{listing.excerpt}</p>
        ) : null}

        {primaryCategory ? (
          <p className="mt-3 line-clamp-1 text-xs font-medium text-zinc-500">
            {primaryCategory.name}
          </p>
        ) : null}

        <div className="mt-auto pt-5">
          {/* Kapsam satırı: kalem sayısı + ilk kalem adı. Fiyat anonim
              ziyaretçiye YOK (görünürlük katmanı) — kart hep aynı yükseklikte
              "bir şey" gösterir, boşluk bırakmaz. */}
          <div className="flex items-baseline justify-between gap-3 border-t border-zinc-950/5 pt-3">
            <p className="min-w-0 truncate text-sm font-medium text-zinc-700">
              {t("itemsCount", { count: listing.itemSummary.count })}
              {listing.itemSummary.totalQuantity ? (
                <span className="font-normal text-zinc-500">
                  {" "}· {fmt.number(Number(listing.itemSummary.totalQuantity))}{" "}
                  {listing.itemSummary.unit}
                </span>
              ) : null}
            </p>
            <span className="shrink-0 tabular-nums text-[11px] text-zinc-500">{listing.number}</span>
          </div>

          <dl className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
            {listing.company.industry ? (
              <div className="flex min-w-0 items-center gap-1">
                <dt className="sr-only">{t("sector")}</dt>
                <BuildingOffice2Icon aria-hidden className="size-3.5 shrink-0 text-zinc-300" />
                <dd className="truncate">{listing.company.industry}</dd>
              </div>
            ) : null}
            {listing.company.city ? (
              <div className="flex items-center gap-1">
                <dt className="sr-only">{t("location")}</dt>
                <MapPinIcon aria-hidden className="size-3.5 text-zinc-300" />
                <dd>{listing.company.city}</dd>
              </div>
            ) : null}
            {(listing.targetCountries ?? []).length > 0 ? (
              <div className="flex items-center gap-1">
                <dt className="sr-only">{t("visibility")}</dt>
                <GlobeAltIcon aria-hidden className="size-3.5 text-zinc-300" />
                <dd>{scopeLabel(listing.targetCountries ?? [])}</dd>
              </div>
            ) : null}
            {listing.closesAt && state === "open" ? (
              <div className="flex items-center gap-1">
                <dt className="sr-only">{t("lastBid")}</dt>
                <ClockIcon aria-hidden className="size-3.5 text-zinc-300" />
                <dd>{formatDate(listing.closesAt, "short", locale)}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      </div>
    </Link>
  );
}

