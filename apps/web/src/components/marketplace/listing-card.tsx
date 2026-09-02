import { formatDate } from "@/lib/format-date";
import type { PublicListingCard } from "@/lib/public/marketplace-api";
import {
  STATE_LABEL,
  listingPath,
  publicState,
} from "@/lib/public/marketplace";
import { currencySymbol } from "@/lib/tenders/labels";
import {
  BuildingOffice2Icon,
  ClockIcon,
  GlobeAltIcon,
  MapPinIcon,
} from "@heroicons/react/20/solid";
import Link from "next/link";

const STATE_CLASS: Record<string, string> = {
  open: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  evaluating: "bg-amber-50 text-amber-700 ring-amber-600/20",
  closed: "bg-zinc-100 text-zinc-600 ring-zinc-500/20",
};

/**
 * Pazar yeri kartı — SUNUCU bileşeni (client JS yok).
 *
 * Kartın tamamı tek bir <Link>; iç içe bağlantı (firma profiline ayrı link)
 * BİLİNÇLİ olarak yok — HTML'de <a> içinde <a> geçersizdir ve tarayıcılar onu
 * sessizce düzeltirken DOM'u bozar. Firma bağlantısı detay sayfasında var.
 */
export function ListingCard({ listing }: { listing: PublicListingCard }) {
  const state = publicState(listing.status);
  const href = listingPath(listing.type, listing.number, listing.title);
  const primaryCategory =
    listing.categories.find((c) => c.level >= 3) ?? listing.categories[0];

  return (
    <Link
      href={href}
      className="group flex h-full flex-col rounded-2xl border border-zinc-200 bg-white p-5 transition hover:border-zinc-300 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATE_CLASS[state]}`}
        >
          {STATE_LABEL[state]}
        </span>
        <span className="font-mono text-xs text-zinc-400">
          {listing.number}
        </span>
      </div>

      <h3 className="mt-3 line-clamp-2 text-base/6 font-semibold text-zinc-950 group-hover:text-blue-700">
        {listing.title}
      </h3>

      {listing.excerpt ? (
        <p className="mt-2 line-clamp-2 text-sm/6 text-zinc-600">
          {listing.excerpt}
        </p>
      ) : null}

      {primaryCategory ? (
        <p className="mt-3 line-clamp-1 text-xs font-medium text-blue-700">
          {primaryCategory.name}
        </p>
      ) : null}

      <div className="mt-auto pt-4">
        <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
          {/* Firma ADI YOK — ilan sahibi anonimdir (bkz. marketplace-api.ts
              PublicCompanyRef). Yerine sektör/faaliyet gibi NİTELİK yazılır;
              backend adı zaten döndürmüyor. */}
          {listing.company.industry ? (
            <div className="flex items-center gap-1">
              <dt className="sr-only">Sektör</dt>
              <BuildingOffice2Icon aria-hidden className="size-3.5 text-zinc-400" />
              <dd className="line-clamp-1 max-w-[18ch]">
                {listing.company.industry}
              </dd>
            </div>
          ) : null}
          {listing.company.city ? (
            <div className="flex items-center gap-1">
              <dt className="sr-only">Konum</dt>
              <MapPinIcon aria-hidden className="size-3.5 text-zinc-400" />
              <dd>{listing.company.city}</dd>
            </div>
          ) : null}
          {listing.isInternational ? (
            <div className="flex items-center gap-1">
              <dt className="sr-only">Kapsam</dt>
              <GlobeAltIcon aria-hidden className="size-3.5 text-zinc-400" />
              <dd>Uluslararası</dd>
            </div>
          ) : null}
          {listing.closesAt && state === "open" ? (
            <div className="flex items-center gap-1">
              <dt className="sr-only">Son teklif</dt>
              <ClockIcon aria-hidden className="size-3.5 text-zinc-400" />
              <dd>{formatDate(listing.closesAt, "short")}</dd>
            </div>
          ) : null}
        </dl>
        {listing.buyNowPrice ? (
          <p className="mt-3 text-sm font-semibold text-zinc-950">
            {currencySymbol(listing.primaryCurrency)}
            {Number(listing.buyNowPrice).toLocaleString("tr-TR")}
            <span className="ml-1 text-xs font-normal text-zinc-500">
              hemen al
            </span>
          </p>
        ) : (
          <p className="mt-3 text-xs text-zinc-500">
            {listing.itemCount} kalem
          </p>
        )}
      </div>
    </Link>
  );
}

/** Boş liste — 404 değil 200 döner; ziyaretçiye ne yapacağını söyler. */
export function EmptyListings({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/60 px-6 py-16 text-center">
      <p className="text-sm font-semibold text-zinc-900">{title}</p>
      {hint ? <p className="mt-1 text-sm text-zinc-600">{hint}</p> : null}
    </div>
  );
}
