"use client";

import { Badge } from "@/components/catalyst/badge";
import { CategoryImage } from "./category-image";
import { formatDate } from "@/lib/format-date";
import type { PublicListingCard } from "@/lib/public/marketplace-api";
import {
  STATE_LABEL,
  listingPath,
  publicState,
  type PublicListingState,
} from "@/lib/public/marketplace";
import { TONE_CLASS, categoryVisual } from "@/lib/public/category-visual";
import { cn } from "@/lib/utils";
import {
  BuildingOffice2Icon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClockIcon,
  GlobeAltIcon,
  MapPinIcon,
} from "@heroicons/react/20/solid";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  /** SATIS kaydı = "ilan" (kapak taşıyabilir), ALIM kaydı = "talep" (asla görsel). */
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
  /** Sabit sütunlar — sırayla. */
  facts: { label: string; value: ReactNode }[];
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
}

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
  const showImage =
    imageMode === "category" ? true : d.kind === "ilan" && !!d.coverImageUrl;
  const v = categoryVisual(d.categoryIds);
  const tone = TONE_CLASS[v.tone];
  const Icon = v.icon;
  return (
    <Link
      href={d.href}
      className={cn(
        "group flex h-full flex-col overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-zinc-950/5 transition hover:-translate-y-0.5 hover:shadow-md hover:ring-zinc-950/10",
        className,
      )}
    >
      {showImage ? (
        <CategoryImage
          src={d.coverImageUrl}
          categoryIds={d.categoryIds}
          alt={d.title}
          ratio="aspect-[4/3]"
          className="border-b border-zinc-950/5"
        />
      ) : null}
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start gap-2.5">
          {!showImage ? (
            // Görselsiz kompakt kart: kategori ikonu — boş kutu değil, ne
            // olduğunu söyleyen küçük bir işaret.
            <span
              className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${tone.surface}`}
            >
              <Icon aria-hidden className={`size-4 ${tone.icon}`} />
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <span className="inline-flex rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] tabular-nums leading-tight text-zinc-600">
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
          {d.timeNote ? <span className="text-xs text-zinc-400">{d.timeNote}</span> : null}
        </div>
      </div>
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* PANEL — row                                                          */
/* ------------------------------------------------------------------ */

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
  // TÜM SATIR tıklanır; başlık gerçek bağlantı (orta tık/klavye). Satır
  // üstündeki diğer etkileşimler yayılımı keser — favoriye tıklamak sayfayı
  // değiştirmesin.
  const go = () => router.push(d.href);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div
      role="row"
      onClick={go}
      className={cn(
        "group/row cursor-pointer rounded-lg border-l-[3px] bg-white ring-1 ring-slate-200 transition-all hover:shadow-sm hover:ring-slate-300",
        d.strip ?? "border-l-slate-300",
        className,
      )}
    >
      <div className={cn("px-3", dense ? "py-2" : "py-2.5")}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            {d.leading}
            <Link href={d.href} onClick={stop} className={cn("min-w-0 rounded", ROW_FOCUS)}>
              <span className="inline-flex rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] tabular-nums leading-tight text-zinc-600">
                {d.number ?? "—"}
              </span>
              <span
                className={cn(
                  "mt-1 text-[13px] font-semibold leading-tight text-slate-900 transition-colors group-hover/row:text-slate-600",
                  dense ? "line-clamp-1" : "line-clamp-2",
                )}
                title={d.title}
              >
                {d.title}
              </span>
              {d.chips && !dense ? (
                <span className="mt-1 flex flex-wrap gap-1">{d.chips}</span>
              ) : null}
            </Link>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1 pt-0.5">
            <span
              className={cn(
                "whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-semibold leading-none",
                d.status.className,
              )}
            >
              {d.status.label}
            </span>
            {d.timeNote ? (
              <span className="whitespace-nowrap text-[10px] text-slate-400">{d.timeNote}</span>
            ) : null}
          </div>
        </div>

        {dense ? (
          // Tek satır özet: ilk iki sütun inline.
          <p className="mt-1 truncate text-[12px] text-slate-500">
            {d.facts.slice(0, 2).map((f, i) => (
              <span key={f.label}>
                {i > 0 ? " · " : ""}
                {f.value}
              </span>
            ))}
          </p>
        ) : d.facts.length > 0 ? (
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-6">
            {d.facts.map((f) => (
              <div key={f.label} className="min-w-0">
                <dt className="block text-[10px] font-semibold uppercase tracking-wide leading-tight text-slate-400">
                  {f.label}
                </dt>
                <dd className="mt-0.5 min-w-0 text-[13px] leading-tight text-slate-800">
                  {f.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}

        {d.metric || d.action || (d.expandable && !dense) ? (
          <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-slate-500">
            <span className="truncate">
              {d.metric ? (
                <>
                  {d.metric.label}: <span className="font-semibold text-slate-800">{d.metric.value}</span>
                </>
              ) : null}
            </span>
            <span className="flex shrink-0 items-center gap-3">
              {d.action ? (
                <Link
                  href={d.action.href}
                  onClick={stop}
                  className={cn("font-semibold text-emerald-700 hover:underline", ROW_FOCUS)}
                >
                  {d.action.label}
                </Link>
              ) : null}
              {d.expandable && !dense ? (
                <button
                  type="button"
                  onClick={(e) => {
                    stop(e);
                    setExpanded((v) => !v);
                  }}
                  aria-expanded={expanded}
                  aria-controls={d.expandable.id}
                  className={cn(
                    "inline-flex items-center gap-0.5 rounded font-medium text-slate-500 hover:text-slate-900",
                    ROW_FOCUS,
                  )}
                >
                  Kalemler
                  <ChevronDownIcon
                    aria-hidden
                    className={cn("size-3.5 transition-transform", expanded && "rotate-180")}
                  />
                </button>
              ) : null}
            </span>
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
  const state = publicState(listing.status);
  const href = listingPath(listing.type, listing.number, listing.title);
  const primaryCategory =
    listing.categories.find((c) => c.level >= 3) ?? listing.categories[0];

  return (
    <Link
      href={href}
      className="group flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-950/5 transition duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:ring-zinc-950/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950"
    >
      {/* Görsel: kayıtta fotoğraf yoksa kategori görseli. Gri kutu YOK —
          envanterin çoğu ALIM ve alıcı fotoğraf yüklemiyor. */}
      <CategoryImage
        src={listing.coverImageUrl}
        alt={listing.title}
        categoryIds={listing.categories.map((c) => c.id)}
        className="border-b border-zinc-950/5"
      />

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center justify-between gap-3">
          <Badge color={STATE_COLOR[state]}>
            {state === "open" ? (
              <span className="size-1.5 rounded-full bg-emerald-500" />
            ) : null}
            {STATE_LABEL[state]}
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
              {listing.itemSummary.count} kalem
              {listing.itemSummary.totalQuantity ? (
                <span className="font-normal text-zinc-500">
                  {" "}· {Number(listing.itemSummary.totalQuantity).toLocaleString("tr-TR")}{" "}
                  {listing.itemSummary.unit}
                </span>
              ) : null}
            </p>
            <span className="shrink-0 font-mono text-[11px] text-zinc-400">{listing.number}</span>
          </div>

          <dl className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
            {listing.company.industry ? (
              <div className="flex min-w-0 items-center gap-1">
                <dt className="sr-only">Sektör</dt>
                <BuildingOffice2Icon aria-hidden className="size-3.5 shrink-0 text-zinc-300" />
                <dd className="truncate">{listing.company.industry}</dd>
              </div>
            ) : null}
            {listing.company.city ? (
              <div className="flex items-center gap-1">
                <dt className="sr-only">Konum</dt>
                <MapPinIcon aria-hidden className="size-3.5 text-zinc-300" />
                <dd>{listing.company.city}</dd>
              </div>
            ) : null}
            {listing.isInternational ? (
              <div className="flex items-center gap-1">
                <dt className="sr-only">Kapsam</dt>
                <GlobeAltIcon aria-hidden className="size-3.5 text-zinc-300" />
                <dd>Uluslararası</dd>
              </div>
            ) : null}
            {listing.closesAt && state === "open" ? (
              <div className="flex items-center gap-1">
                <dt className="sr-only">Son teklif</dt>
                <ClockIcon aria-hidden className="size-3.5 text-zinc-300" />
                <dd>{formatDate(listing.closesAt, "short")}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      </div>
    </Link>
  );
}

