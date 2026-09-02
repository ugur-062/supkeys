import { MarketingHeader } from "@/components/marketing/marketing-header";
import { CompanyCard } from "@/components/marketplace/company-card";
import { EmptyListings } from "@/components/marketplace/listing-card";
import { MarketplaceFooter } from "@/components/marketplace/marketplace-footer";
import { Pagination } from "@/components/marketplace/pagination";
import { SearchForm } from "@/components/marketplace/search-form";
import { MARKETPLACE_ROUTES } from "@/lib/public/marketplace";
import { fetchDirectory } from "@/lib/public/marketplace-api";
import { MARKETPLACE_LIVE } from "@/lib/public/marketplace-live";
import { companyActivityLabel } from "@rothern/shared";
import { LockClosedIcon } from "@heroicons/react/20/solid";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

/**
 * FİRMA DİZİNİ — GİRİŞ GEREKTİRİR (ürün kararı 2026-09-02).
 *
 * Pazar yerinin diğer sayfalarından ayrılıyor: burada firma ADLARI var ve
 * bunlar anonim ziyaretçiye açılmıyor. Sonuçları:
 *   · rota `PUBLIC_ROUTE_PREFIXES`te DEĞİL → nonce'lı sıkı CSP alır,
 *   · bu yüzden `force-dynamic` ZORUNLU (nonce statik HTML'e gömülemez),
 *   · `noindex` + sitemap dışı → arama motoru "kaydolun" ekranını indekslemez.
 *
 * Menüde/altbilgide bağlantısı DURUYOR: anonim ziyaretçi kayıt ekranına
 * düşer, bu bir çıkmaz değil dönüşüm hunisidir.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Firmalar",
  description:
    "Rothern'de kayıtlı alıcı ve tedarikçi firmaları sektör, şehir ve faaliyet tipine göre inceleyin. Dizin kayıtlı kullanıcılara açıktır.",
  robots: { index: false, follow: true },
};

interface SP {
  q?: string;
  il?: string;
  kategori?: string;
  faaliyet?: string;
  sayfa?: string;
}

/** Giriş yapmamış ziyaretçiye gösterilen kapı. */
function SignInWall() {
  return (
    <div className="mx-auto max-w-2xl rounded-2xl border border-zinc-200 bg-zinc-50/60 px-6 py-16 text-center">
      <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-white ring-1 ring-zinc-200">
        <LockClosedIcon aria-hidden className="size-6 text-zinc-400" />
      </span>
      <h2 className="mt-6 text-xl font-semibold text-zinc-950">
        Firma dizini üyelere açık
      </h2>
      <p className="mx-auto mt-3 max-w-md text-base/7 text-zinc-600">
        Alıcı ve tedarikçi firmaları sektör, şehir ve faaliyet tipine göre
        incelemek için giriş yapın. Kaydolmak ücretsiz.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/company/kayit"
          className="rounded-full bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
        >
          Ücretsiz kaydol
        </Link>
        <Link
          href="/company/login"
          className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-semibold text-zinc-900 transition hover:bg-white"
        >
          Giriş yap
        </Link>
      </div>
      <p className="mt-8 text-sm text-zinc-500">
        Açık alım talepleri ve satılık ilanlar üyelik olmadan görünür —{" "}
        <Link
          href={MARKETPLACE_ROUTES.demands}
          className="font-medium text-blue-700 hover:underline"
        >
          pazar yerine göz atın
        </Link>
        .
      </p>
    </div>
  );
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  if (!MARKETPLACE_LIVE) notFound();
  const sp = await searchParams;
  const pageNo = Number(sp.sayfa);

  // Çerezi elle iletiyoruz: sunucu bileşeninde tarayıcının çerezi API'ye
  // kendiliğinden gitmez. Kapının kendisi API'de (CompanyJwtAuthGuard) —
  // burada yalnız taşıyoruz, karar vermiyoruz.
  const cookieHeader = (await cookies()).toString();
  const result = await fetchDirectory(cookieHeader, {
    q: sp.q?.trim() || undefined,
    city: sp.il?.trim() || undefined,
    category: /^\d{8}$/.test(sp.kategori ?? "") ? sp.kategori : undefined,
    activity: sp.faaliyet || undefined,
    page: Number.isFinite(pageNo) && pageNo > 1 ? Math.trunc(pageNo) : undefined,
  });

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
            Kayıtlı alıcı ve tedarikçi firmalar. Faaliyet tipine ve şehre göre
            süzün, profilinden doğrudan iletişime geçin.
          </p>
        </header>

        {!result.authenticated ? (
          <div className="mt-12">
            <SignInWall />
          </div>
        ) : (
          <>
            <div className="mt-8 max-w-3xl">
              <SearchForm
                action={base}
                defaultValue={sp.q}
                placeholder="Firma adı, sektör veya hizmet"
                hidden={{
                  il: sp.il,
                  kategori: sp.kategori,
                  faaliyet: sp.faaliyet,
                }}
              />
            </div>

            {result.facets.activities.length > 0 ? (
              <div className="mt-6 flex flex-wrap gap-2">
                {result.facets.activities.map((a) => (
                  <Link
                    key={a.activity}
                    href={href({
                      faaliyet:
                        sp.faaliyet === a.activity ? undefined : a.activity,
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
                {result.facets.cities.length > 0 ? (
                  <section>
                    <h2 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                      Şehir
                    </h2>
                    <ul className="mt-3 space-y-1">
                      {result.facets.cities.slice(0, 15).map((c) => (
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
                  {result.page.total > 0
                    ? `${result.page.total.toLocaleString("tr-TR")} firma`
                    : "Firma yok"}
                </p>
                {result.page.items.length === 0 ? (
                  <EmptyListings
                    title={
                      hasFilter
                        ? "Bu süzgeçlerle eşleşen firma yok."
                        : "Henüz herkese açık firma profili yok."
                    }
                    hint={
                      hasFilter
                        ? "Süzgeçleri gevşetip yeniden deneyin."
                        : "Firmalar profillerini açtıkça burada görünür."
                    }
                  />
                ) : (
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                    {result.page.items.map((c) => (
                      <CompanyCard key={c.slug ?? c.name} company={c} />
                    ))}
                  </div>
                )}
                <Pagination
                  page={result.page.page}
                  total={result.page.total}
                  pageSize={result.page.pageSize}
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
          </>
        )}
      </main>
      <MarketplaceFooter />
    </div>
  );
}
