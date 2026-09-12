import { CompanyIndex } from "@/components/marketplace/company-index";
import { MARKETPLACE_LABELS, MARKETPLACE_ROUTES } from "@/lib/public/marketplace";
import { MARKETPLACE_LIVE } from "@/lib/public/marketplace-live";
import type { SearchParamsLike } from "@/lib/public/filter-param-utils";
import { dizinBos } from "@/lib/seo/empty-index-guard";
import { buildMetadata } from "@/lib/seo/meta";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

/**
 * FİRMA DİZİNİ — HERKESE AÇIK (görünürlük v2). Gövde `CompanyIndex`
 * bileşeninde: şehir açılış sayfası (`/firmalar/sehir/<il>`) aynı listeyi
 * kullanıyor.
 */
export const revalidate = 300;

/**
 * Meta İSTEK ANINDA üretilir: dizin BOŞSA `noindex` basılır (ince içerik /
 * yumuşak 404 koruması, `lib/seo/empty-index-guard.ts`). İlk kayıt girince
 * kural kendiliğinden kalkar.
 */
export async function generateMetadata(): Promise<Metadata> {
  const bos = await dizinBos("firmalar");
  return buildMetadata({
  title: `${MARKETPLACE_LABELS.companies} — doğrulanmış alıcı ve tedarikçi firmalar`,
  description:
    "Rothern'deki alıcı ve tedarikçi firmalar: faaliyet tipi, şehir ve kategoriye göre süzün; ürünlerini ve profillerini inceleyin.",
  path: MARKETPLACE_ROUTES.companies,
    noindex: bos,
  });
}

export default async function Page({ searchParams }: { searchParams: Promise<SearchParamsLike> }) {
  if (!MARKETPLACE_LIVE) notFound();
  return <CompanyIndex searchParams={await searchParams} />;
}
