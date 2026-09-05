import { ViewBeacon } from "@/components/marketplace/view-beacon";
import { CompanyProfileView } from "@/components/company/company-profile-view";
import { CompanyProducts } from "@/components/marketplace/company-products";
import { fetchCompanyProducts } from "@/lib/public/marketplace-api";
import { GatedField } from "@/components/marketplace/gated-field";
import { PublicLayout } from "@/components/marketplace/public-layout";
import { serializeJsonLd } from "@/lib/json-ld";
import { PANEL_TARGET, loginHref } from "@/lib/public/visibility";
import { resolveApiBaseUrl } from "@/lib/resolve-api-url";
import { resolveSiteUrl } from "@/lib/site-url";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const revalidate = 300;

/**
 * HERKESE AÇIK PROFİL v2 (2026-09-04): tamamen gezilebilir — Hakkında,
 * hizmet, sertifika, kuruluş, çalışan, ortalama puan. Rothern ID, iletişim,
 * puan dağılımı, sipariş sayıları, talep/ilan listesi ÜYEYE (API döndürmez).
 */
interface PublicProfile {
  name: string;
  goldMember?: boolean;
  verified?: boolean;
  slug: string | null;
  industry: string | null;
  activities?: string[];
  categories: { id: string; name: string }[];
  city: string | null;
  country: string | null;
  logoUrl: string | null;
  coverImageUrl: string | null;
  photos: string[];
  aboutText: string | null;
  services: string[];
  certifications: string[];
  certificateImages: string[];
  foundedYear: number | null;
  employeeCount: string | null;
  ratingAvg: number | null;
  productCount: number;
}

async function fetchProfile(slug: string): Promise<PublicProfile | null> {
  const base = resolveApiBaseUrl();
  if (!base) return null;
  try {
    const res = await fetch(
      `${base}/public/companies/${encodeURIComponent(slug)}`,
      { next: { revalidate: 300 } },
    );
    if (!res.ok) return null;
    return (await res.json()) as PublicProfile;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const p = await fetchProfile(slug);
  if (!p) return { title: "Firma bulunamadı — Rothern" };

  const title = `${p.name} — Rothern`;
  const description = (
    p.aboutText?.replace(/\s+/g, " ").slice(0, 160) ||
    `${p.name}${p.industry ? ` · ${p.industry}` : ""}${
      p.city ? ` · ${p.city}` : ""
    } — Rothern üzerinde tedarik profili.`
  ).trim();
  const url = `${resolveSiteUrl()}/firma/${slug}`;
  const image = p.coverImageUrl ?? p.logoUrl ?? undefined;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "profile",
      siteName: "Rothern",
      images: image ? [{ url: image }] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function PublicCompanyProfile({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // Profil ve ürünler PARALEL: ürün bileşeni kendi çekiyordu, profil bitmeden
  // başlamıyordu → TTFB 1,5 sn (Lighthouse). Sonuç prop'la iner.
  const [p, products] = await Promise.all([fetchProfile(slug), fetchCompanyProducts(slug)]);
  if (!p) notFound();

  const site = resolveSiteUrl();
  const url = `${site}/firma/${slug}`;
  const panelHref = PANEL_TARGET.company(slug);

  // Yapısal veri sayfada GÖRÜNENİ söyler: dış bağlantılar üyeye, JSON-LD'de yok.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: p.name,
    url,
    ...(p.logoUrl ? { logo: p.logoUrl } : {}),
    ...(p.coverImageUrl ? { image: p.coverImageUrl } : {}),
    ...(p.aboutText ? { description: p.aboutText.slice(0, 500) } : {}),
    ...(p.foundedYear ? { foundingDate: String(p.foundedYear) } : {}),
    ...(p.city
      ? {
          address: {
            "@type": "PostalAddress",
            addressLocality: p.city,
            addressCountry: p.country ?? "TR",
          },
        }
      : {}),
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Rothern", item: site },
      { "@type": "ListItem", position: 2, name: p.name, item: url },
    ],
  };

  return (
    <PublicLayout className="bg-zinc-50">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbLd) }}
      />

      <div className="mx-auto max-w-5xl px-4 pb-16 pt-28 sm:px-6">
        {/* Kimlik ÖNCE (logo, ad, rozet, şehir, faaliyet, kategori), ürünler
            sonra — ziyaretçi kimin sayfasında olduğunu ürünlerden önce
            öğrenmeli. Sayfadaki TEK büyük kayıt kutusu sağ sütunun sonunda
            (`gate.aside`); diğer kapılar satır içi bağlantı. */}
        <ViewBeacon type="profile" companySlug={slug} />
        <CompanyProfileView
          profile={{
            name: p.name,
            goldMember: p.goldMember,
            verified: p.verified,
            industry: p.industry,
            activities: p.activities,
            categories: p.categories,
            city: p.city,
            country: p.country,
            logoUrl: p.logoUrl,
            coverImageUrl: p.coverImageUrl,
            aboutText: p.aboutText,
            photos: p.photos ?? [],
            services: p.services ?? [],
            certifications: p.certifications ?? [],
            certificateImages: p.certificateImages ?? [],
            foundedYear: p.foundedYear,
            employeeCount: p.employeeCount,
            ratingAvg: p.ratingAvg,
            // Kapılı alanlar (Rothern ID, web/sosyal, puan dağılımı, sipariş
            // sayıları) BURAYA YAZILMAZ — null bile değil; anahtar adı RSC
            // yüküne düşerdi.
          }}
          actions={
            <a
              href={loginHref(panelHref)}
              className="rounded-full bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
            >
              Bağlantı isteği gönder
            </a>
          }
          gate={{
            stats: <GatedField label="Rothern ID ve iletişim" redirect={panelHref} />,
            aside: (
              <GatedField
                size="box"
                label="Puan dağılımı, sipariş geçmişi ve açık talepler"
                hint={`${p.name} ile bağlantı kurmak, mesajlaşmak ve teklif almak için ücretsiz hesap — 2 dakika, kredi kartı yok.`}
                redirect={panelHref}
              />
            ),
          }}
          main={<CompanyProducts companySlug={p.slug ?? ""} page={products} />}
        />
      </div>
    </PublicLayout>
  );
}
