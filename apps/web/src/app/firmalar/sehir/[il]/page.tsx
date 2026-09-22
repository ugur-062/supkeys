import { cityFromSlug } from "@/lib/public/city";
import { MARKETPLACE_ROUTES } from "@/lib/public/marketplace";
import { MARKETPLACE_LIVE } from "@/lib/public/marketplace-live";
import { buildMetadata } from "@/lib/seo/meta";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

/**
 * ŞEHİR FİRMA SAYFASI KAPANDI (2026-09-22, kullanıcı kararı: "hepsini
 * sıralamayalım, tamamını görmek için üye olmaya yönlendirelim, sayı
 * görünmesin"). Herkese açık firma dizini artık liste değil, üyeliğe
 * yönlendiren vitrin (`CompanyIndex`); şehir bazlı liste de o karara girer.
 * Eski adresler (sitemap'te ve dış bağlantılarda olabilir) `/firmalar`a
 * 308; bilinmeyen il 404. Ürün şehir sayfaları (`/urunler/sehir/<il>`)
 * ETKİLENMEDİ.
 */
export const revalidate = 600;
export const dynamicParams = true;

type Params = Promise<{ il: string }>;

/* Yönlendirme sayfası; şablon sözleşmesi (`page-meta-contract`) için meta yine tek kaynaktan. */
export const metadata: Metadata = buildMetadata({
  title: "Firmalar",
  description: "Firma dizini.",
  path: MARKETPLACE_ROUTES.companies,
  noindex: true,
});

export async function generateStaticParams() {
  return [];
}

export default async function Page({ params }: { params: Params }) {
  if (!MARKETPLACE_LIVE) notFound();
  const { il } = await params;
  if (!cityFromSlug(il)) notFound();
  permanentRedirect(MARKETPLACE_ROUTES.companies);
}
