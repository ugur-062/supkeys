import { companyActivityLabel } from "@rothern/shared";
import type { PublicDirectoryCompany } from "@/lib/public/marketplace-api";
import { BuildingOffice2Icon, MapPinIcon } from "@heroicons/react/20/solid";
import Link from "next/link";

/**
 * Firma dizini kartı — SUNUCU bileşeni.
 *
 * `slug` her zaman dolu (API kapısı `slug: { not: null }` istiyor), yine de
 * tipte null olabilir; bu durumda kart bağlantısız düz kutu olur — 404'e
 * bağlantı vermektense tıklanamaz kart göstermek doğru.
 */
export function CompanyCard({ company }: { company: PublicDirectoryCompany }) {
  const inner = (
    <>
      <div className="flex items-center gap-3">
        {company.logoUrl ? (
          // `next/image` DEĞİL: logolar R2/CDN'den geliyor ve
          // `images.remotePatterns` yapılandırılmamış — profil sayfası da aynı
          // sebeple düz <img> kullanıyor (company-profile-view.tsx).
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={company.logoUrl}
            alt=""
            width={48}
            height={48}
            className="size-12 shrink-0 rounded-lg object-contain ring-1 ring-zinc-200"
          />
        ) : (
          <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-zinc-100 ring-1 ring-zinc-200">
            <BuildingOffice2Icon aria-hidden className="size-6 text-zinc-400" />
          </span>
        )}
        <div className="min-w-0">
          <h3 className="line-clamp-1 text-base font-semibold text-zinc-950 group-hover:text-blue-700">
            {company.name}
          </h3>
          {company.city ? (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500">
              <MapPinIcon aria-hidden className="size-3.5 text-zinc-400" />
              {company.city}
            </p>
          ) : null}
        </div>
      </div>

      {company.industry ? (
        <p className="mt-3 line-clamp-1 text-xs font-medium text-blue-700">
          {company.industry}
        </p>
      ) : null}

      {company.aboutText ? (
        <p className="mt-2 line-clamp-3 text-sm/6 text-zinc-600">
          {company.aboutText}
        </p>
      ) : null}

      {company.activities.length > 0 ? (
        <ul className="mt-4 flex flex-wrap gap-1.5">
          {company.activities.map((a) => (
            <li
              key={a}
              className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600"
            >
              {companyActivityLabel(a)}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );

  const className =
    "group flex h-full flex-col rounded-2xl border border-zinc-200 bg-white p-5 transition";

  if (!company.slug) {
    return <div className={className}>{inner}</div>;
  }
  return (
    <Link
      href={`/firma/${company.slug}`}
      className={`${className} hover:border-zinc-300 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600`}
    >
      {inner}
    </Link>
  );
}
