import { CategoryVisualBox } from "./category-visual-box";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { listingPath, publicState } from "@/lib/public/marketplace";
import type { PublicListingCard } from "@/lib/public/marketplace-api";
import { signupHref } from "@/lib/public/visibility";
import { ClockIcon, GlobeAltIcon, LockClosedIcon, MapPinIcon } from "@heroicons/react/20/solid";
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

/** Aciliyet = ton: ≤3 gün kırmızı, ≤7 gün amber, ötesi nötr (kart sistemi). */
function leftTone(left: number): "danger" | "gold" | "neutral" {
  if (left <= 3) return "danger";
  if (left <= 7) return "gold";
  return "neutral";
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
            <Badge tone="neutral" size="sm" className="min-w-0 shrink bg-white/90 font-medium text-zinc-700 ring-1 ring-inset ring-zinc-950/5">
              <span className="truncate">{primaryCategory.name}</span>
            </Badge>
          ) : <span />}
          {left != null ? (
            <Badge tone={leftTone(left)} size="sm" icon={false} className="tnum bg-white/90">
              <ClockIcon aria-hidden className="size-3" />
              {left <= 0 ? "Bugün kapanıyor" : `${left} gün kaldı`}
            </Badge>
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
          <p className="mt-3 tnum text-2xl font-semibold tracking-tight text-zinc-950">
            {qty.toLocaleString("tr-TR")}
            <span className="ml-1 text-base font-medium text-zinc-500">{l.itemSummary.unit}</span>
          </p>
        ) : null}
        <p className={`text-xs text-zinc-500 tnum ${qty ? "mt-0.5" : "mt-3"}`}>
          {l.itemSummary.count} kalem · kalem adları ve şartname üyelere
        </p>

        <dl className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-600">
          {l.company.verified ? (
            <div className="flex items-center">
              <dt className="sr-only">Alıcı doğrulaması</dt>
              <dd>
                <Badge tone="verified" size="sm">Doğrulanmış alıcı</Badge>
              </dd>
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
            {/* Kapalı zarf bir KURAL — ipucu neyin gizli kaldığını söyler. */}
            <Tooltip label="Teklifler kapalı zarf: teklifçiler birbirinin fiyatını görmez.">
              <span className="flex items-center gap-1">
                <LockClosedIcon aria-hidden className="size-3.5 text-zinc-300" />
                <dd>Kapalı zarf</dd>
              </span>
            </Tooltip>
          </div>
        </dl>

        <div className="mt-auto flex items-center justify-between gap-3 pt-5">
          <span className="tnum font-mono text-xs font-medium text-zinc-500">{l.number}</span>
          <Button href={signupHref("teklif", href)} className="relative z-10">
            Teklif ver
          </Button>
        </div>
      </div>
    </article>
  );
}
