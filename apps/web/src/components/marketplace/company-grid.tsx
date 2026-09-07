import { CompanyCard } from "./company-card";
import { MARKETPLACE_ROUTES } from "@/lib/public/marketplace";
import type { PublicDirectoryCard } from "@/lib/public/marketplace-api";
import { ArrowRightIcon } from "@heroicons/react/20/solid";
import Link from "next/link";

export const COMPANY_GRID_MIN = 4;

/** "Rothern'daki firmalar" — 6 dizin kartı; eşik altında çizilmez. */
export function CompanyGrid({ companies }: { companies: PublicDirectoryCard[] }) {
  if (companies.length < COMPANY_GRID_MIN) return null;
  return (
    <section className="mx-auto max-w-7xl px-6 py-14 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl">Rothern&apos;daki firmalar</h2>
        <Link href={MARKETPLACE_ROUTES.companies} className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-900 hover:text-zinc-600">
          Tüm firmalar
          <ArrowRightIcon aria-hidden className="size-4" />
        </Link>
      </div>
      <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {companies.slice(0, 6).map((c) => (
          <CompanyCard key={c.slug} company={c} />
        ))}
      </div>
    </section>
  );
}
