import { formatDate } from "@/lib/format-date";
import type { PublicListingCard } from "@/lib/public/marketplace-api";
import {
  STATE_LABEL,
  listingPath,
  publicState,
} from "@/lib/public/marketplace";
import { currencySymbol } from "@/lib/tenders/labels";
import {
  ArrowUpRightIcon,
  BuildingOffice2Icon,
  ClockIcon,
  GlobeAltIcon,
  MapPinIcon,
} from "@heroicons/react/20/solid";
import Link from "next/link";

/**
 * Durum rozeti. Marka monokrom (bkz. globals.css `@theme` — mavi aksanlar
 * bilinçle zinc'e map edilmiş), o yüzden RENK yalnız DURUM anlatır:
 * yeşil = teklif alınıyor, kehribar = karar aşamasında, gri = bitti.
 */
const STATE_CLASS: Record<string, string> = {
  open: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  evaluating: "bg-amber-50 text-amber-700 ring-amber-600/20",
  closed: "bg-zinc-100 text-zinc-600 ring-zinc-500/20",
};

/**
 * Pazar yeri kartı — SUNUCU bileşeni (client JS yok).
 *
 * Kartın tamamı tek bir <Link>; iç içe bağlantı BİLİNÇLİ olarak yok — HTML'de
 * <a> içinde <a> geçersizdir ve tarayıcı onu sessizce düzeltirken DOM'u bozar.
 *
 * Görsel hiyerarşi başlıkta toplanır: kart yüksekliği sabit değil ama meta
 * satırı `mt-auto` ile daima alta yapışır, böylece ızgaradaki kartların alt
 * kenarları hizalanır (farklı uzunlukta başlıklar diziyi tırtıklı yapmaz).
 */
export function ListingCard({ listing }: { listing: PublicListingCard }) {
  const state = publicState(listing.status);
  const href = listingPath(listing.type, listing.number, listing.title);
  const primaryCategory =
    listing.categories.find((c) => c.level >= 3) ?? listing.categories[0];

  return (
    <Link
      href={href}
      className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-zinc-900/20 hover:shadow-xl hover:shadow-zinc-950/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950"
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATE_CLASS[state]}`}
        >
          {state === "open" ? (
            <span className="size-1.5 rounded-full bg-emerald-500" />
          ) : null}
          {STATE_LABEL[state]}
        </span>
        <ArrowUpRightIcon
          aria-hidden
          className="size-4 shrink-0 text-zinc-300 transition group-hover:text-zinc-900"
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
        <div className="flex items-baseline justify-between gap-3 border-t border-zinc-100 pt-3">
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
    </Link>
  );
}

/**
 * Boş liste — 200 döner, 404 değil.
 *
 * Eski hâli 150px'lik kesikli bir kutuydu ve sayfanın en görünür yerinde
 * "bozuk" izlenimi veriyordu. Artık kompakt ve AKSİYONLU: ziyaretçiye ne
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
    <div className="flex flex-col items-start gap-4 rounded-2xl border border-zinc-200 bg-zinc-50/70 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
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
