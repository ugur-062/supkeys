import { CityLinks } from "@/components/marketplace/city-links";
import { CompanyIndex } from "@/components/marketplace/company-index";
import { allCitySlugs, cityCompanyPath, cityFromSlug, citySlug } from "@/lib/public/city";
import type { SearchParamsLike } from "@/lib/public/filter-param-utils";
import { fetchPublicDirectoryFacets } from "@/lib/public/marketplace-api";
import { MARKETPLACE_LIVE } from "@/lib/public/marketplace-live";
import { buildMetadata } from "@/lib/seo/meta";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

/**
 * ŞEHİR AÇILIŞ SAYFASI — FİRMALAR (2026-09-09, Parça 3).
 *
 * Ürün tarafının ikizi; gerekçeler orada yazılı (`app/urunler/sehir/[il]`).
 * Liste gövdesi `CompanyIndex` bileşeninden gelir — `/firmalar` ile AYNI
 * bileşen, yoksa iki liste zamanla ayrışırdı.
 */
export const revalidate = 600;
export const dynamicParams = true;

type Params = Promise<{ il: string }>;

export async function generateStaticParams() {
  if (!MARKETPLACE_LIVE) return [];
  const facets = await fetchPublicDirectoryFacets({});
  const known = new Map(allCitySlugs().map((c) => [c.name, c.slug]));
  return facets.cities
    .filter((c) => c.count > 0 && known.has(c.city))
    .map((c) => ({ il: known.get(c.city)! }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { il } = await params;
  const name = cityFromSlug(il);
  if (!name) return { title: "Şehir bulunamadı", robots: { index: false } };
  const facets = await fetchPublicDirectoryFacets({});
  const count = facets.cities.find((c) => c.city === name)?.count ?? 0;

  return buildMetadata({
    title: `${name} firmaları — tedarikçi ve alıcı dizini`,
    description:
      count > 0
        ? `${name}'da Rothern'e kayıtlı ${count} firma: faaliyet tipi, sektör ve ürünleriyle. Profilleri inceleyin, doğrudan bilgi isteyin.`
        : `${name} için Rothern'de henüz listelenmiş firma yok. Yakın illerdeki firmaları inceleyebilir ya da ücretsiz profil açabilirsiniz.`,
    path: cityCompanyPath(name),
    noindex: count === 0,
  });
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<SearchParamsLike>;
}) {
  if (!MARKETPLACE_LIVE) notFound();
  const { il } = await params;
  const name = cityFromSlug(il);
  if (!name) notFound();
  if (citySlug(name) !== il) permanentRedirect(cityCompanyPath(name));

  const [sp, facets] = await Promise.all([searchParams, fetchPublicDirectoryFacets({})]);
  const count = facets.cities.find((c) => c.city === name)?.count ?? 0;

  return (
    <CompanyIndex
      searchParams={sp}
      fixedCity={name}
      title={`${name} firmaları`}
      lead={
        count > 0
          ? `${name}'da Rothern'e kayıtlı alıcı ve tedarikçi firmalar. Faaliyet tipi, sektör ve ürünleriyle inceleyin.`
          : `${name} için henüz listelenmiş firma yok. Aşağıdaki illerden devam edebilirsiniz.`
      }
      footer={<CityLinks cities={facets.cities} kind="companies" activeCity={name} />}
    />
  );
}
