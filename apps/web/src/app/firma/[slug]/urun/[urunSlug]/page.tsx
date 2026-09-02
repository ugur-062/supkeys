import { ProductDetail } from "@/components/marketplace/product-detail";
import { fetchProduct } from "@/lib/public/marketplace-api";
import { MARKETPLACE_LIVE } from "@/lib/public/marketplace-live";
import { resolveSiteUrl } from "@/lib/site-url";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

/**
 * Ürün sayfası — firmanın ALTINDA yaşar (`/firma/<slug>/urun/<slug>`).
 *
 * URL'in firma altında olması bilinçli: ürün sayfası firma sayfasının
 * otoritesinden beslenir ve ikisi arasındaki ilişki adresten okunur.
 * Europages de aynı şemayı kullanıyor.
 */
export const revalidate = 300;

type Params = Promise<{ slug: string; urunSlug: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  if (!MARKETPLACE_LIVE) return { robots: { index: false } };
  const { slug, urunSlug } = await params;
  const data = await fetchProduct(slug, urunSlug);
  if (!data) return { title: "Ürün bulunamadı", robots: { index: false } };

  const { product, company } = data;
  const description =
    product.description?.replace(/\s+/g, " ").trim().slice(0, 160) ??
    `${company.name} firmasının ${product.name} ürünü.`;

  return {
    title: `${product.name} — ${company.name}`,
    description,
    alternates: {
      canonical: `${resolveSiteUrl()}/firma/${slug}/urun/${product.slug}`,
    },
    openGraph: {
      title: product.name,
      description,
      images: product.images.slice(0, 1),
      type: "website",
    },
  };
}

export default async function Page({ params }: { params: Params }) {
  if (!MARKETPLACE_LIVE) notFound();
  const { slug, urunSlug } = await params;
  const data = await fetchProduct(slug, urunSlug);
  if (!data) notFound();
  return (
    <ProductDetail
      product={data.product}
      company={data.company}
      companySlug={slug}
    />
  );
}
