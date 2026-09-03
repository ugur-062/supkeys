import { CompanyLogo } from "@/components/company/company-logo";
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
        <CompanyLogo
          src={company.logoUrl}
          alt=""
          className="size-12 shrink-0 rounded-lg object-contain ring-1 ring-zinc-950/5"
          fallback={
            <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-zinc-100 ring-1 ring-zinc-950/5">
              <BuildingOffice2Icon aria-hidden className="size-6 text-zinc-400" />
            </span>
          }
        />
        <div className="min-w-0">
          <h3 className="line-clamp-1 text-base font-semibold text-zinc-950 group-hover:text-zinc-600">
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
        <p className="mt-3 line-clamp-1 text-xs font-medium text-zinc-500">
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
    "group flex h-full flex-col rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-950/5 transition duration-200";

  if (!company.slug) {
    return <div className={className}>{inner}</div>;
  }
  return (
    <Link
      href={`/firma/${company.slug}`}
      className={`${className} hover:-translate-y-0.5 hover:shadow-lg hover:ring-zinc-950/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950`}
    >
      {inner}
    </Link>
  );
}
