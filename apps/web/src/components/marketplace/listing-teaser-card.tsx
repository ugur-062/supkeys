import { CategoryVisualBox } from "./category-visual-box";
import { listingPath, publicState } from "@/lib/public/marketplace";
import type { PublicListingCard } from "@/lib/public/marketplace-api";
import { signupHref } from "@/lib/public/visibility";
import { ArrowRightIcon, CheckBadgeIcon, ClockIcon, GlobeAltIcon, LockClosedIcon, MapPinIcon } from "@heroicons/react/20/solid";
import { companyActivityLabel } from "@rothern/shared";
import Link from "next/link";

/**
 * ALIM TALEBİ TEASER KARTI (görünürlük v2) — "gizli ama cezbedici".
 *
 * Ölçek ve aciliyet ÖNDE: büyük miktar satırı ("2 kalem · 1.200 adet"),
 * "N gün kaldı" rozeti, doğrulanmış alıcı, şehir + faaliyet, kalem satırları
 * (ad yok, miktar var), "Teklif ver" primary. Alıcı adı, kalem adları, hedef
 * fiyat YOK. "N tedarikçi inceledi" YOK (görüntülenme kolonu yok).
 */
function daysLeft(iso: string | null): number | null {
  if (!iso) return null;
  const d = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  return Number.isFinite(d) ? d : null;
}

export function ListingTeaserCard({ listing: l }: { listing: PublicListingCard }) {
  const href = listingPath(l.type, l.number, l.title);
  const open = publicState(l.status) === "open";
  const left = open ? daysLeft(l.closesAt) : null;
  const activity = l.company.activities[0];
  const who = [activity ? companyActivityLabel(activity) : null, l.company.city].filter(Boolean).join(" · ");
  const primaryCategory = l.categories.find((c) => c.level >= 3) ?? l.categories[0];
  const urgent = left != null && left <= 5;

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-950/5 transition hover:-translate-y-0.5 hover:shadow-lg hover:ring-zinc-950/10">
      {/* Üst şerit: kategori görseli tonu + kalan süre */}
      <div className="relative">
        <CategoryVisualBox categoryIds={l.categories.map((c) => c.id)} ratio="aspect-[5/1]" />
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 px-4 pb-2">
          {primaryCategory ? (
            <span className="rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium text-zinc-700 ring-1 ring-zinc-950/5">
              {primaryCategory.name}
            </span>
          ) : <span />}
          {left != null ? (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${
                urgent ? "bg-amber-100 text-amber-900 ring-amber-600/20" : "bg-white/90 text-zinc-700 ring-zinc-950/5"
              }`}
            >
              <ClockIcon aria-hidden className="size-3" />
              {left <= 0 ? "Bugün kapanıyor" : `${left} gün kaldı`}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="line-clamp-2 text-base/6 font-semibold text-zinc-950">
          <Link href={href} className="hover:text-zinc-600">{l.title}</Link>
        </h3>

        {/* Ölçek — kartın en büyük yazısı */}
        <p className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950 tabular-nums">
          {l.itemSummary.totalQuantity ? (
            <>
              {Number(l.itemSummary.totalQuantity).toLocaleString("tr-TR")}
              <span className="ml-1 text-base font-medium text-zinc-500">{l.itemSummary.unit}</span>
            </>
          ) : (
            <>
              {l.itemSummary.count}
              <span className="ml-1 text-base font-medium text-zinc-500">kalem</span>
            </>
          )}
        </p>
        <p className="mt-0.5 text-xs text-zinc-500">
          {l.itemSummary.count} kalem · kalem adları ve şartname üyelere
        </p>

        <dl className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-600">
          {l.company.verified ? (
            <div className="flex items-center gap-1 font-medium text-emerald-700">
              <CheckBadgeIcon aria-hidden className="size-3.5" />
              <dd>Doğrulanmış alıcı</dd>
            </div>
          ) : null}
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
          <div className="flex items-center gap-1">
            <LockClosedIcon aria-hidden className="size-3.5 text-zinc-300" />
            <dd>Kapalı zarf</dd>
          </div>
        </dl>

        <div className="mt-auto flex items-center justify-between gap-3 pt-5">
          <Link href={href} className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-900">
            {l.number}
            <ArrowRightIcon aria-hidden className="size-3.5" />
          </Link>
          <Link
            href={signupHref("teklif", href)}
            className="rounded-full bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
          >
            Teklif ver
          </Link>
        </div>
      </div>
    </article>
  );
}
