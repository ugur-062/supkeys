import { CategoryVisualBox } from "./category-visual-box";
import { formatDate } from "@/lib/format-date";
import { listingPath, publicState } from "@/lib/public/marketplace";
import type { PublicListingCard } from "@/lib/public/marketplace-api";
import { signupHref } from "@/lib/public/visibility";
import { CheckBadgeIcon, ClockIcon, GlobeAltIcon, MapPinIcon } from "@heroicons/react/20/solid";
import { companyActivityLabel } from "@rothern/shared";
import Link from "next/link";

/**
 * ALIM TALEBİ TEASER KARTI (görünürlük v2) — görselsiz: kategori ikonu ·
 * başlık · "2 kalem · 1.200 adet" · kapsam · "Üretici · İstanbul" ·
 * Doğrulanmış alıcı · kalan süre · "Teklif ver" → kayıt (intent=teklif,
 * redirect=talep sayfası). Alıcı adı, kalem adları, hedef fiyat YOK.
 *
 * "N tedarikçi inceledi" sayacı YOK: görüntülenme kolonu yok (şema kararı),
 * uydurma sayı basılmaz.
 */
export function ListingTeaserCard({ listing: l }: { listing: PublicListingCard }) {
  const href = listingPath(l.type, l.number, l.title);
  const open = publicState(l.status) === "open";
  const activity = l.company.activities[0];
  const who = [activity ? companyActivityLabel(activity) : null, l.company.city].filter(Boolean).join(" · ");
  return (
    <article className="flex h-full flex-col rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-950/5">
      <div className="flex items-start gap-3">
        <CategoryVisualBox categoryIds={l.categories.map((c) => c.id)} ratio="aspect-square" className="size-12 shrink-0 rounded-xl" />
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-base/6 font-semibold text-zinc-950">
            <Link href={href} className="hover:text-zinc-600">{l.title}</Link>
          </h3>
          <p className="mt-1 text-sm text-zinc-700">
            {l.itemSummary.count} kalem
            {l.itemSummary.totalQuantity
              ? ` · ${Number(l.itemSummary.totalQuantity).toLocaleString("tr-TR")} ${l.itemSummary.unit}`
              : ""}
          </p>
        </div>
      </div>
      <dl className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
        {who ? (
          <div className="flex items-center gap-1">
            <dt className="sr-only">Alıcı</dt>
            <MapPinIcon aria-hidden className="size-3.5 text-zinc-300" />
            <dd>{who}</dd>
          </div>
        ) : null}
        <div className="flex items-center gap-1">
          <dt className="sr-only">Kapsam</dt>
          <GlobeAltIcon aria-hidden className="size-3.5 text-zinc-300" />
          <dd>{l.isInternational ? "Uluslararası" : "Yurtiçi"}</dd>
        </div>
        {l.company.verified ? (
          <div className="flex items-center gap-1 text-emerald-700">
            <CheckBadgeIcon aria-hidden className="size-3.5" />
            <dd>Doğrulanmış alıcı</dd>
          </div>
        ) : null}
        {l.closesAt && open ? (
          <div className="flex items-center gap-1">
            <dt className="sr-only">Son teklif</dt>
            <ClockIcon aria-hidden className="size-3.5 text-zinc-300" />
            <dd>{formatDate(l.closesAt, "short")}</dd>
          </div>
        ) : null}
      </dl>
      <div className="mt-auto flex items-center justify-between gap-3 pt-4">
        <span className="text-xs text-zinc-500">Kapalı zarf · {l.number}</span>
        <Link
          href={signupHref("teklif", href)}
          className="rounded-full bg-zinc-950 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
        >
          Teklif ver
        </Link>
      </div>
    </article>
  );
}
