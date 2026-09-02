import { MarketingHeader } from "@/components/marketing/marketing-header";
import { CompanyCard } from "@/components/marketplace/company-card";
import { EmptyListings } from "@/components/marketplace/listing-card";
import { MarketplaceFooter } from "@/components/marketplace/marketplace-footer";
import { Pagination } from "@/components/marketplace/pagination";
import { SearchForm } from "@/components/marketplace/search-form";
import { MARKETPLACE_ROUTES } from "@/lib/public/marketplace";
import {
  fetchDirectory,
  fetchDirectoryFacets,
} from "@/lib/public/marketplace-api";
import { resolveSiteUrl } from "@/lib/site-url";
import { companyActivityLabel } from "@rothern/shared";
import { MARKETPLACE_LIVE } from "@/lib/public/marketplace-live";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";

export const revalidate = 120;

const SITE = resolveSiteUrl();

export const metadata: Metadata = {
  title: "Firmalar — doğrulanmış tedarikçi ve alıcı dizini",
  description:
    "Rothern'de herkese açık profili olan firmaları sektör, şehir ve faaliyet tipine göre inceleyin. Üretici, distribütör, hizmet sağlayıcı, ithalatçı ve fason firmalar.",
  alternates: { canonical: `${SITE}${MARKETPLACE_ROUTES.companies}` },
  openGraph: {
    title: "Firmalar — Rothern",
    url: `${SITE}${MARKETPLACE_ROUTES.companies}`,
    type: "website",
  },
};

interface SP {
  q?: string;
  il?: string;
  kategori?: string;
  faaliyet?: string;
  sayfa?: string;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  // Yayın anahtarı kapalıyken pazar yeri rotaları YOK sayılır.
  if (!MARKETPLACE_LIVE) notFound();
  const sp = await searchParams;
  const pageNo = Number(sp.sayfa);
  const [dir, facets] = await Promise.all([
    fetchDirectory({
      q: sp.q?.trim() || undefined,
      city: sp.il?.trim() || undefined,
      category: /^\d{8}$/.test(sp.kategori ?? "") ? sp.kategori : undefined,
      activity: sp.faaliyet || undefined,
      page: Number.isFinite(pageNo) && pageNo > 1 ? Math.trunc(pageNo) : undefined,
    }),
    fetchDirectoryFacets(),
  ]);

  const base = MARKETPLACE_ROUTES.companies;
  const href = (patch: Partial<SP>) => {
    const next: Record<string, string | undefined> = {
      q: sp.q,
      il: sp.il,
      kategori: sp.kategori,
      faaliyet: sp.faaliyet,
      ...patch,
    };
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) usp.set(k, v);
    const s = usp.toString();
    return s ? `${base}?${s}` : base;
  };

  const hasFilter = !!(sp.q || sp.il || sp.kategori || sp.faaliyet);

  return (
    <div className="min-h-dvh bg-white">
      <MarketingHeader />
      <main className="mx-auto max-w-7xl px-6 pt-28 pb-24 lg:px-8">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
            Firmalar
          </h1>
          <p className="mt-3 max-w-2xl text-base/7 text-zinc-600">
            Herkese açık profili olan alıcı ve tedarikçi firmalar. Faaliyet
            tipine ve şehre göre süzün, profilinden doğrudan iletişime geçin.
          </p>
        </header>

        <div className="mt-8 max-w-3xl">
          <SearchForm
            action={base}
            defaultValue={sp.q}
            placeholder="Firma adı, sektör veya hizmet"
            hidden={{ il: sp.il, kategori: sp.kategori, faaliyet: sp.faaliyet }}
          />
        </div>

        {facets.activities.length > 0 ? (
          <div className="mt-6 flex flex-wrap gap-2">
            {facets.activities.map((a) => (
              <Link
                key={a.activity}
                href={href({
                  faaliyet: sp.faaliyet === a.activity ? undefined : a.activity,
                })}
                aria-current={sp.faaliyet === a.activity ? "true" : undefined}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                  sp.faaliyet === a.activity
                    ? "bg-zinc-950 text-white"
                    : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                }`}
              >
                {companyActivityLabel(a.activity)}
                <span className="ml-1.5 text-xs opacity-70">{a.count}</span>
              </Link>
            ))}
          </div>
        ) : null}

        <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[16rem_1fr]">
          <aside className="lg:sticky lg:top-28 lg:self-start">
            {facets.cities.length > 0 ? (
              <section>
                <h2 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                  Şehir
                </h2>
                <ul className="mt-3 space-y-1">
                  {facets.cities.slice(0, 15).map((c) => (
                    <li key={c.city}>
                      <Link
                        href={href({
                          il: sp.il === c.city ? undefined : c.city,
                        })}
                        aria-current={sp.il === c.city ? "true" : undefined}
                        className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm transition ${
                          sp.il === c.city
                            ? "bg-blue-50 font-medium text-blue-800"
                            : "text-zinc-700 hover:bg-zinc-100"
                        }`}
                      >
                        <span className="line-clamp-1">{c.city}</span>
                        <span className="shrink-0 text-xs text-zinc-400">
                          {c.count}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </aside>

          <div>
            <p className="mb-4 text-sm text-zinc-500">
              {dir.total > 0
                ? `${dir.total.toLocaleString("tr-TR")} firma`
                : "Firma yok"}
            </p>
            {dir.items.length === 0 ? (
              <EmptyListings
                title={
                  hasFilter
                    ? "Bu süzgeçlerle eşleşen firma yok."
                    : "Henüz herkese açık firma profili yok."
                }
                hint={
                  hasFilter
                    ? "Süzgeçleri gevşetip yeniden deneyin."
                    : "Firmalar profillerini herkese açtıkça burada görünür."
                }
              />
            ) : (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {dir.items.map((c) => (
                  <CompanyCard key={c.slug ?? c.name} company={c} />
                ))}
              </div>
            )}
            <Pagination
              page={dir.page}
              total={dir.total}
              pageSize={dir.pageSize}
              basePath={base}
              params={{
                q: sp.q,
                il: sp.il,
                kategori: sp.kategori,
                faaliyet: sp.faaliyet,
              }}
            />
          </div>
        </div>
      </main>
      <MarketplaceFooter />
    </div>
  );
}
