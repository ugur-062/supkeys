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
import { currencySymbol } from "@/lib/tenders/labels";
import {
  BuildingOffice2Icon,
  ChevronRightIcon,
  ClockIcon,
  GlobeAltIcon,
  MapPinIcon,
} from "@heroicons/react/20/solid";
import Link from "next/link";

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
 * Pazar yeri kartı — SUNUCU bileşeni (client JS yok).
 *
 * Application UI "Lists / Grid lists / simple cards" düzeni: beyaz yüzey,
 * `ring-1 ring-zinc-950/5` + `shadow-sm`. Kenarlık yerine ring kullanmak
 * Catalyst'in kendi yüzey dilidir; 1px kenarlıktan daha yumuşak durur ve
 * hover'da kalınlaştığında düzeni kaydırmaz.
 *
 * Kartın tamamı tek bir <Link>; iç içe bağlantı BİLİNÇLİ olarak yok — HTML'de
 * <a> içinde <a> geçersizdir ve tarayıcı onu sessizce düzeltirken DOM'u bozar.
 *
 * Meta satırı `mt-auto` ile daima alta yapışır → farklı uzunlukta başlıklar
 * ızgarayı tırtıklı yapmaz.
 */
export function ListingCard({ listing }: { listing: PublicListingCard }) {
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
        <p className="mt-2 line-clamp-2 text-sm/6 text-zinc-500">
          {listing.excerpt}
        </p>
      ) : null}

      {primaryCategory ? (
        <p className="mt-3 line-clamp-1 text-xs font-medium text-zinc-500">
          {primaryCategory.name}
        </p>
      ) : null}

      <div className="mt-auto pt-5">
        {/* Fiyat varsa vurgulu satır; yoksa kalem sayısı — kart hep aynı
            yükseklikte "bir şey" gösterir, boşluk bırakmaz. */}
        <div className="flex items-baseline justify-between gap-3 border-t border-zinc-950/5 pt-3">
          {listing.buyNowPrice ? (
            <p className="text-lg font-semibold tracking-tight text-zinc-950">
              {currencySymbol(listing.primaryCurrency)}
              {Number(listing.buyNowPrice).toLocaleString("tr-TR")}
              <span className="ml-1.5 text-xs font-normal text-zinc-400">
                hemen al
              </span>
            </p>
          ) : (
            <p className="text-sm font-medium text-zinc-700">
              {listing.itemCount} kalem
            </p>
          )}
          <span className="font-mono text-[11px] text-zinc-400">
            {listing.number}
          </span>
        </div>

        <dl className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
          {listing.company.industry ? (
            <div className="flex min-w-0 items-center gap-1">
              <dt className="sr-only">Sektör</dt>
              <BuildingOffice2Icon
                aria-hidden
                className="size-3.5 shrink-0 text-zinc-300"
              />
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

/**
 * Boş liste — 200 döner, 404 değil.
 *
 * Kesikli kutu yerine kompakt ve AKSİYONLU bir yüzey: ziyaretçiye ne
 * yapacağını söylüyor. Envanteri az bir pazar yerinde bu fark büyük.
 */
export function EmptyListings({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className="flex flex-col items-start gap-4 rounded-2xl bg-white px-6 py-8 shadow-sm ring-1 ring-zinc-950/5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-semibold text-zinc-900">{title}</p>
        {hint ? <p className="mt-1 text-sm text-zinc-500">{hint}</p> : null}
      </div>
      {action ? (
        <Link
          href={action.href}
          className="shrink-0 rounded-full bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
