import { CategoryVisualBox } from "./category-visual-box";
import { listingPath, publicState } from "@/lib/public/marketplace";
import type { PublicListingCard } from "@/lib/public/marketplace-api";
import { signupHref } from "@/lib/public/visibility";
import { CheckBadgeIcon, ClockIcon, GlobeAltIcon, LockClosedIcon, MapPinIcon } from "@heroicons/react/20/solid";
import { companyActivityLabel } from "@rothern/shared";
import Link from "next/link";

/**
 * ALIM TALEBİ TEASER KARTI (görünürlük v2) — "gizli ama cezbedici".
 *
 * Ölçek ve aciliyet ÖNDE: büyük miktar YALNIZ birimiyle ("1.200 adet");
 * birim yoksa büyük sayı basılmaz — "3" tek başına ne olduğu belirsiz bir
 * rakamdı (B4). Kalem sayısı her zaman meta satırında. "N gün kaldı": ≤3 gün
 * kırmızı, ≤7 amber. Tüm kart tıklanır (başlık bağlantısı karta yayılır);
 * "Teklif ver" ayrı hedef, üstte. Alıcı adı, kalem adları, hedef fiyat YOK.
 */
function daysLeft(iso: string | null): number | null {
  if (!iso) return null;
  const d = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  return Number.isFinite(d) ? d : null;
}

function leftTone(left: number): string {
  if (left <= 3) return "bg-rose-100 text-rose-900 ring-rose-600/20";
  if (left <= 7) return "bg-amber-100 text-amber-900 ring-amber-600/20";
  return "bg-white/90 text-zinc-700 ring-zinc-950/5";
}

export function ListingTeaserCard({ listing: l }: { listing: PublicListingCard }) {
  const href = listingPath(l.number, l.title);
  const open = publicState(l.status) === "open";
  const left = open ? daysLeft(l.closesAt) : null;
  const activity = l.company.activities[0];
  const who = [activity ? companyActivityLabel(activity) : null, l.company.city].filter(Boolean).join(" · ");
  const primaryCategory = l.categories.find((c) => c.level >= 3) ?? l.categories[0];
  const qty = l.itemSummary.totalQuantity && l.itemSummary.unit ? Number(l.itemSummary.totalQuantity) : null;

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-950/5 transition hover:-translate-y-0.5 hover:shadow-lg hover:ring-zinc-950/10 focus-within:ring-2 focus-within:ring-zinc-950">
      {/* Üst şerit: kategori görseli tonu + kalan süre */}
      <div className="relative">
        <CategoryVisualBox categoryIds={l.categories.map((c) => c.id)} ratio="aspect-[5/1]" />
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 px-4 pb-2">
          {primaryCategory ? (
            <span className="min-w-0 truncate rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium text-zinc-700 ring-1 ring-zinc-950/5">
              {primaryCategory.name}
            </span>
          ) : <span />}
          {left != null ? (
            <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 tabular-nums ${leftTone(left)}`}>
              <ClockIcon aria-hidden className="size-3" />
              {left <= 0 ? "Bugün kapanıyor" : `${left} gün kaldı`}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="line-clamp-2 text-base/6 font-semibold text-zinc-950">
          {/* Yayılmış bağlantı — kartın tamamı bu hedefe gider. */}
          <Link href={href} className="after:absolute after:inset-0 after:content-[''] hover:text-zinc-600 focus:outline-none">
            {l.title}
          </Link>
        </h3>

        {/* Ölçek — kartın en büyük yazısı; yalnız birimli miktar */}
        {qty ? (
          <p className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950 tabular-nums">
            {qty.toLocaleString("tr-TR")}
            <span className="ml-1 text-base font-medium text-zinc-500">{l.itemSummary.unit}</span>
          </p>
        ) : null}
        <p className={`text-xs text-zinc-500 tabular-nums ${qty ? "mt-0.5" : "mt-3"}`}>
          {l.itemSummary.count} kalem · kalem adları ve şartname üyelere
        </p>

        <dl className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-600">
          {l.company.verified ? (
            <div className="flex items-center gap-1 font-medium whitespace-nowrap text-emerald-700">
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
          <span className="text-xs font-medium text-zinc-500 tabular-nums">{l.number}</span>
          <Link
            href={signupHref("teklif", href)}
            className="relative z-10 rounded-full bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
          >
            Teklif ver
          </Link>
        </div>
      </div>
    </article>
  );
}
