import { EmptyListings, ListingCard } from "./listing-card";
import type { PublicListingCard } from "@/lib/public/marketplace-api";
import { ArrowRightIcon } from "@heroicons/react/20/solid";
import Link from "next/link";

/** Anasayfadaki "son kayıtlar" bölümü — başlık + ızgara + "tümü" bağlantısı. */
export function SectionGrid({
  heading,
  lead,
  href,
  hrefLabel,
  listings,
  emptyTitle,
}: {
  heading: string;
  lead: string;
  href: string;
  hrefLabel: string;
  listings: PublicListingCard[];
  emptyTitle: string;
}) {
  return (
    <section className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl">
            {heading}
          </h2>
          <p className="mt-2 max-w-2xl text-base/7 text-zinc-600">{lead}</p>
        </div>
        <Link
          href={href}
          className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:text-blue-900"
        >
          {hrefLabel}
          <ArrowRightIcon aria-hidden className="size-4" />
        </Link>
      </div>
      <div className="mt-8">
        {listings.length === 0 ? (
          <EmptyListings
            title={emptyTitle}
            hint="Yeni kayıtlar yayımlandıkça burada görünür."
          />
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((l) => (
              <ListingCard key={l.number} listing={l} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
