import { ViewBeacon } from "@/components/marketplace/view-beacon";
import { CompanyProfileView } from "@/components/company/company-profile-view";
import { CompanyProducts } from "@/components/marketplace/company-products";
import { fetchCompanyProducts, fetchCompanyProfile, type PublicProfile } from "@/lib/public/marketplace-api";
import { GatedField } from "@/components/marketplace/gated-field";
import { MARKET_GROUND, PublicLayout } from "@/components/marketplace/public-layout";
import { JsonLd } from "@/components/seo/json-ld";
import { companySeo } from "@/lib/seo/entities";
import { PANEL_TARGET, loginHref } from "@/lib/public/visibility";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const p = await fetchCompanyProfile(slug);
  if (!p) return { title: "Firma bulunamadı", robots: { index: false } };
  /* TEK KAYNAK (`lib/seo/entities.ts`): başlık/açıklama/kanonik/OG ile
     sayfanın JSON-LD'si aynı olgulardan türer. Eskiden başlık markayı elle
     ekliyordu ("… — Rothern") ve kök şablon bir daha ekliyordu. */
  const meta = companySeo(seoInput(slug, p)).metadata;
  // VİTRİN ≠ İNDEKS: profil herkese açık (bağlantıyla gelen görür) ama kalite
  // eşiğini geçmiyorsa arama motoruna girmez. Eşik sunucuda, sitemap ile AYNI
  // fonksiyon — burada yalnız sonucu okuyoruz.
  return p.indexable === false
    ? { ...meta, robots: { index: false, follow: true } }
    : meta;
}

/** Profil yükünden SEO girdisi — metadata ve JSON-LD aynı dönüşümü kullanır. */
function seoInput(slug: string, p: PublicProfile, products?: { name: string; slug: string }[]) {
  return {
    slug,
    name: p.name,
    industry: p.industry,
    city: p.city,
    country: p.country,
    aboutText: p.aboutText,
    logoUrl: p.logoUrl,
    coverImageUrl: p.coverImageUrl,
    foundedYear: p.foundedYear,
    employeeCount: p.employeeCount,
    categories: p.categories,
    certifications: p.certifications,
    verified: p.verified,
    productCount: p.productCount,
    products,
    website: p.website,
    linkedinUrl: p.linkedinUrl,
  };
}

export default async function PublicCompanyProfile({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  /** `?urun=` — FİRMA İÇİ ürün araması (spec §7). Ayrı bir ada sahip:
   *  `q` üst çubuktaki genel aramanın parametresi, ikisi karışmamalı. */
  searchParams?: Promise<{ urun?: string; urunSayfa?: string; onizleme?: string }>;
}) {
  const { slug } = await params;
  // Profil ve ürünler PARALEL: ürün bileşeni kendi çekiyordu, profil bitmeden
  // başlamıyordu → TTFB 1,5 sn (Lighthouse). Sonuç prop'la iner.
  const sp = await searchParams;
  const productQuery = sp?.urun?.trim() || undefined;
  // Ürün sayfası AYRI ada sahip (`urunSayfa`): profil sayfasında başka bir
  // sayfalama yok ama `sayfa` adı liste sayfalarının şemasında — aynı adı
  // paylaşmak ileride kopyala-yapıştır bağlantıda yanlış listeyi sayfalar.
  const productPage = Math.max(1, Number(sp?.urunSayfa ?? 1) || 1);
  // `?onizleme=1`: Profilim'deki "Herkese açık görünümü önizle" bağlantısı —
  // sahibi az önce kaydettiğini görsün diye veri önbelleği atlanır (ISR
  // kopyası 5 dk bayat kalabiliyordu). Sayfa içeriği ve şablon AYNI.
  const fresh = sp?.onizleme === "1";
  const [p, products] = await Promise.all([
    fetchCompanyProfile(slug, { fresh }),
    fetchCompanyProducts(slug, { q: productQuery, page: productPage, fresh }),
  ]);
  if (!p) notFound();

  const panelHref = PANEL_TARGET.company(slug);

  /* Yapısal veri sayfada GÖRÜNENİ söyler: iletişim, Rothern ID ve puan
     dağılımı üyeye kapalı olduğu için JSON-LD'ye de girmez. Ortalama puan
     bilerek yazılmıyor — şema oy SAYISI ister, o alan herkese açık değil
     (gerekçe `lib/seo/entities.ts` içinde). Vitrindeki ilk ürünler
     `hasOfferCatalog` olarak eklenir: "bu firma ne satıyor" sorusunun
     makine-okunur cevabı. */
  const seo = companySeo(
    seoInput(
      slug,
      p,
      products.items.map((it) => ({ name: it.name, slug: it.slug })),
    ),
  );

  return (
    <PublicLayout className={MARKET_GROUND}>
      <JsonLd data={seo.jsonLd} />

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
              className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
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
          main={
            <CompanyProducts companySlug={p.slug ?? ""} page={products} query={productQuery} />
          }
        />
      </div>
    </PublicLayout>
  );
}
