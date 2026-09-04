import { CompanyCard } from "@/components/marketplace/company-card";
import { FacetGroup } from "@/components/marketplace/facets";
import { Pagination } from "@/components/marketplace/pagination";
import { PublicEmptyState } from "@/components/marketplace/public-empty-state";
import { PublicLayout } from "@/components/marketplace/public-layout";
import { PublicListPage, ResultGrid } from "@/components/marketplace/public-list-page";
import { MARKETPLACE_LABELS, MARKETPLACE_ROUTES } from "@/lib/public/marketplace";
import { fetchPublicDirectory, fetchPublicDirectoryFacets } from "@/lib/public/marketplace-api";
import { MARKETPLACE_LIVE } from "@/lib/public/marketplace-live";
import { resolveSiteUrl } from "@/lib/site-url";
import { companyActivityLabel, isCompanyActivity } from "@rothern/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

/**
 * FİRMA DİZİNİ — HERKESE AÇIK (görünürlük v2, 2026-09-04 kullanıcı kararı;
 * 2 Eylül'de girişli yapılmıştı). Listelenme koşulu API'de: profil kapısı +
 * (≥1 yayında ürün VEYA tamlık ≥ %60). Rothern ID ve iletişim üyeye.
 *
 * Public rota → `PUBLIC_ROUTE_PREFIXES`te, ISR, nonce'suz CSP, sitemap'te.
 */
export const revalidate = 300;

export const metadata: Metadata = {
  title: `${MARKETPLACE_LABELS.companies} — doğrulanmış alıcı ve tedarikçi firmalar`,
  description:
    "Rothern'deki alıcı ve tedarikçi firmalar: faaliyet tipi, şehir ve kategoriye göre süzün; ürünlerini ve profillerini inceleyin.",
  alternates: { canonical: `${resolveSiteUrl()}${MARKETPLACE_ROUTES.companies}` },
  openGraph: {
    title: `${MARKETPLACE_LABELS.companies} — Rothern`,
    url: `${resolveSiteUrl()}${MARKETPLACE_ROUTES.companies}`,
    type: "website",
  },
};

interface SP {
  q?: string;
  il?: string;
  kategori?: string;
  faaliyet?: string;
  dogrulanmis?: string;
  urunlu?: string;
  sayfa?: string;
}

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  if (!MARKETPLACE_LIVE) notFound();
  const sp = await searchParams;
  const pageNo = Number(sp.sayfa);
  const params = {
    q: sp.q?.trim() || undefined,
    city: sp.il?.trim() || undefined,
    category: /^\d{8}$/.test(sp.kategori ?? "") ? sp.kategori : undefined,
    activity: sp.faaliyet && isCompanyActivity(sp.faaliyet) ? sp.faaliyet : undefined,
    verified: sp.dogrulanmis === "1",
    hasProducts: sp.urunlu === "1",
    page: Number.isFinite(pageNo) && pageNo > 1 ? Math.trunc(pageNo) : undefined,
  };
  const [result, facets] = await Promise.all([fetchPublicDirectory(params), fetchPublicDirectoryFacets()]);

  const base = MARKETPLACE_ROUTES.companies;
  const href = (patch: Partial<SP>) => {
    const next: Record<string, string | undefined> = {
      q: sp.q,
      il: sp.il,
      kategori: sp.kategori,
      faaliyet: sp.faaliyet,
      dogrulanmis: sp.dogrulanmis,
      urunlu: sp.urunlu,
      ...patch,
    };
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) usp.set(k, v);
    const s = usp.toString();
    return s ? `${base}?${s}` : base;
  };
  const hasFilter = !!(params.q || params.city || params.category || params.activity || params.verified || params.hasProducts);

  const chips = [
    ...(params.q ? [{ key: "q", label: `"${params.q}"`, href: href({ q: undefined }) }] : []),
    ...(params.city ? [{ key: "il", label: params.city, href: href({ il: undefined }) }] : []),
    ...(params.activity
      ? [{ key: "faaliyet", label: companyActivityLabel(params.activity), href: href({ faaliyet: undefined }) }]
      : []),
    ...(params.verified ? [{ key: "dogrulanmis", label: "Doğrulanmış", href: href({ dogrulanmis: undefined }) }] : []),
    ...(params.hasProducts ? [{ key: "urunlu", label: "Ürünü olan", href: href({ urunlu: undefined }) }] : []),
  ];

  return (
    <PublicLayout>
      <PublicListPage
        title={MARKETPLACE_LABELS.companies}
        lead="Rothern'deki alıcı ve tedarikçi firmalar. Faaliyet tipi, şehir ve kategoriye göre süzün; profil ve ürünleri inceleyin. İletişim için ücretsiz hesap."
        search={{
          action: base,
          defaultValue: sp.q,
          placeholder: "Firma adı, sektör veya hizmet",
          hidden: { il: sp.il, kategori: sp.kategori, faaliyet: sp.faaliyet, dogrulanmis: sp.dogrulanmis, urunlu: sp.urunlu },
        }}
        chips={chips}
        clearHref={base}
        summary={result.total > 0 ? `${result.total.toLocaleString("tr-TR")} firma` : undefined}
        sidebar={
          <>
            <FacetGroup
              heading="Firma profili"
              items={[
                { key: "v", label: "Doğrulanmış", count: facets.verified, href: href({ dogrulanmis: params.verified ? undefined : "1" }), active: params.verified },
                { key: "p", label: "Ürünü olan", count: facets.withProducts, href: href({ urunlu: params.hasProducts ? undefined : "1" }), active: params.hasProducts },
              ].filter((i) => i.count > 0 || i.active)}
            />
            <FacetGroup
              heading="Faaliyet tipi"
              items={facets.activities.map((a) => ({
                key: a.activity,
                label: companyActivityLabel(a.activity),
                count: a.count,
                href: href({ faaliyet: params.activity === a.activity ? undefined : a.activity }),
                active: params.activity === a.activity,
              }))}
            />
            <FacetGroup
              heading="Şehir"
              items={facets.cities.slice(0, 15).map((c) => ({
                key: c.city,
                label: c.city,
                count: c.count,
                href: href({ il: params.city === c.city ? undefined : c.city }),
                active: params.city === c.city,
              }))}
            />
          </>
        }
      >
        {result.items.length === 0 ? (
          <PublicEmptyState noun="Firma" clearHref={hasFilter ? base : undefined} />
        ) : (
          <ResultGrid count={result.items.length}>
            {result.items.map((c) => (
              <CompanyCard key={c.slug} company={c} />
            ))}
          </ResultGrid>
        )}
        <Pagination
          page={result.page}
          total={result.total}
          pageSize={result.pageSize}
          basePath={base}
          params={{ q: sp.q, il: sp.il, kategori: sp.kategori, faaliyet: sp.faaliyet, dogrulanmis: sp.dogrulanmis, urunlu: sp.urunlu }}
        />
      </PublicListPage>
    </PublicLayout>
  );
}
