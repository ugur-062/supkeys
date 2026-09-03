import { CompanyProfileView } from "@/components/company/company-profile-view";
import { CompanyProducts } from "@/components/marketplace/company-products";
import { GatedField } from "@/components/marketplace/gated-field";
import { PublicLayout } from "@/components/marketplace/public-layout";
import { serializeJsonLd } from "@/lib/json-ld";
import { PANEL_TARGET } from "@/lib/public/visibility";
import { resolveApiBaseUrl } from "@/lib/resolve-api-url";
import { resolveSiteUrl } from "@/lib/site-url";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const revalidate = 300;

/**
 * ANONİM katman (görünürlük katmanı, 2026-09-04) — API yalnız bunu döndürür.
 * Rothern ID, kuruluş, çalışan, puan, hizmet, sertifika, iletişim panelde
 * (`/company/firma/<slug>`). Tip API projeksiyonunu yansıtır; alan eklemek
 * için önce `public-profile.service.ts`.
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
  aboutExcerpt: string | null;
  aboutTruncated: boolean;
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
    p.aboutExcerpt?.replace(/\s+/g, " ").slice(0, 160) ||
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
  const p = await fetchProfile(slug);
  if (!p) notFound();

  const site = resolveSiteUrl();
  const url = `${site}/firma/${slug}`;
  const panelHref = PANEL_TARGET.company(slug);

  // Yapısal veri sayfada GÖRÜNENİ söyler: kuruluş yılı ve dış bağlantılar
  // artık anonime gösterilmiyor, JSON-LD'ye de yazılmaz.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: p.name,
    url,
    ...(p.logoUrl ? { logo: p.logoUrl } : {}),
    ...(p.coverImageUrl ? { image: p.coverImageUrl } : {}),
    ...(p.aboutExcerpt ? { description: p.aboutExcerpt } : {}),
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
            aboutText: p.aboutExcerpt,
            services: [],
            certifications: [],
            certificateImages: [],
            photos: p.photos ?? [],
            foundedYear: null,
            employeeCount: null,
            website: null,
            linkedinUrl: null,
            instagramUrl: null,
            rating: null,
            reviewSummary: null,
          }}
          gate={{
            stats: (
              <GatedField label="Kuruluş, çalışan sayısı ve iletişim" redirect={panelHref} />
            ),
            about: p.aboutTruncated ? (
              <GatedField label="Devamı" redirect={panelHref} />
            ) : null,
            aside: (
              <GatedField
                size="box"
                label="Değerlendirmeler, sertifikalar ve hizmetler"
                hint={`${p.name} ile bağlantı kurmak, teklif almak ve firma detaylarını görmek için hesap gerekir.`}
                redirect={panelHref}
              />
            ),
          }}
          main={<CompanyProducts companySlug={p.slug ?? ""} />}
        />
      </div>
    </PublicLayout>
  );
}
