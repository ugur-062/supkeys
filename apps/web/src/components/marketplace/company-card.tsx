import { CompanyLogo } from "@/components/company/company-logo";
import { Thumb } from "@/components/ui/thumb";
import type { PublicDirectoryCard } from "@/lib/public/marketplace-api";
import { BuildingOffice2Icon, CheckBadgeIcon, MapPinIcon } from "@heroicons/react/20/solid";
import { companyActivityLabel } from "@rothern/shared";
import Link from "next/link";

/**
 * FİRMA DİZİNİ KARTI — herkese açık (görünürlük v2, Europages kalıbı):
 * logo · ad · Doğrulanmış · şehir · faaliyet tipi · ana kategori · ürün
 * sayısı · 3 ürün küçük resmi · "Profili gör". Rothern ID ve iletişim YOK.
 */
export function CompanyCard({
  company: c,
  href,
  badge,
}: {
  company: PublicDirectoryCard;
  /** Panel: `/company/firma/<id>`; public: `/firma/<slug>` (varsayılan). */
  href?: string;
  /** Panel: bağlantı durumu rozeti. */
  badge?: React.ReactNode;
}) {
  const activities = c.activities.slice(0, 2);
  return (
    <Link
      href={href ?? `/firma/${c.slug}`}
      className="group flex h-full flex-col rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-950/5 transition hover:-translate-y-0.5 hover:shadow-md hover:ring-zinc-950/10"
    >
      <div className="flex items-start gap-3">
        <CompanyLogo
          src={c.logoUrl}
          alt=""
          className="size-12 shrink-0 rounded-xl object-cover ring-1 ring-zinc-950/5"
          fallback={
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-zinc-100">
              <BuildingOffice2Icon aria-hidden className="size-6 text-zinc-400" />
            </span>
          }
        />
        <div className="min-w-0">
          {/* Ad + ✓ AYNI satırda: ad taşarsa ad kısalır, rozet alt satıra
              düşmez (B7). */}
          <h3 className="flex min-w-0 items-center gap-1.5 text-base font-semibold whitespace-nowrap text-zinc-950">
            <span className="truncate">{c.name}</span>
            {c.verified ? (
              <CheckBadgeIcon aria-label="Doğrulanmış firma" className="size-4 shrink-0 text-emerald-600" />
            ) : null}
          </h3>
          {badge ? <div className="mt-1">{badge}</div> : null}
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-zinc-500">
            {c.city ? (
              <span className="inline-flex items-center gap-1">
                <MapPinIcon aria-hidden className="size-3.5 text-zinc-300" />
                {c.city}
              </span>
            ) : null}
            {c.mainCategory ? <span className="line-clamp-1">{c.mainCategory.name}</span> : null}
          </p>
        </div>
      </div>

      {activities.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {activities.map((a) => (
            <span key={a} className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
              {companyActivityLabel(a)}
            </span>
          ))}
        </div>
      ) : null}

      {c.productPreview.length > 0 ? (
        <div className="mt-4 flex items-center gap-2">
          {c.productPreview.map((p) => (
            <Thumb key={p.slug} src={p.image ?? undefined} alt="" size="md" />
          ))}
          {c.productCount > c.productPreview.length ? (
            <span className="text-xs font-medium text-zinc-500">+{c.productCount - c.productPreview.length}</span>
          ) : null}
        </div>
      ) : null}

      <div className="mt-auto flex items-center justify-between pt-4 text-sm">
        <span className="text-zinc-500">
          {c.productCount > 0 ? `${c.productCount.toLocaleString("tr-TR")} ürün` : "Profil"}
        </span>
        <span className="font-semibold text-zinc-900 group-hover:text-zinc-600">Profili gör →</span>
      </div>
    </Link>
  );
}
