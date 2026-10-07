import { getTranslations, setRequestLocale } from "next-intl/server";
import { localeFromParams, type LocaleParams } from "@/i18n/params";
import { seoT } from "@/i18n/server";
import { ViewBeacon } from "@/components/marketplace/view-beacon";
import { CompanyProfileView } from "@/components/company/company-profile-view";
import { CompanyProducts } from "@/components/marketplace/company-products";
import { fetchCompanyProducts, fetchCompanyProfile, type PublicProfile } from "@/lib/public/marketplace-api";
import { attributeSsrToVisitor } from "@/lib/public/ssr-visitor";
import { GatedField } from "@/components/marketplace/gated-field";
import { PublicConnectCta } from "@/components/marketplace/connect-cta";
import { MARKET_GROUND, PublicLayout } from "@/components/marketplace/public-layout";
import { JsonLd } from "@/components/seo/json-ld";
import { companySeo } from "@/lib/seo/entities";
import { publicProfileViewData } from "@/lib/public/public-profile-view";
import { PANEL_TARGET, loginHref } from "@/lib/public/visibility";
import { Link } from "@/i18n/navigation";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const revalidate = 300;

const CONNECT_CLS =
  "rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const locale = await localeFromParams(params);
  // Metadata sayfadan ÖNCE çekiyor: rastgele slug burada da ziyaretçiye bağlı
  // gitsin, ortak SSR kovasına düşmesin (sayfa zaten dinamik — RM-12).
  await attributeSsrToVisitor();
  const p = await fetchCompanyProfile(slug);
  if (!p) return { title: (await getTranslations({ locale, namespace: "web.marketplace.pages" }))("companyNotFound"), robots: { index: false } };
  /* TEK KAYNAK (`lib/seo/entities.ts`): başlık/açıklama/kanonik/OG ile
     sayfanın JSON-LD'si aynı olgulardan türer. Eskiden başlık markayı elle
     ekliyordu ("… — Rothern") ve kök şablon bir daha ekliyordu. */
  // VİTRİN ≠ İNDEKS: profil herkese açık (bağlantıyla gelen görür) ama kalite
  // eşiğini geçmiyorsa (ya da bu dilde çevirisi bekliyorsa) arama motoruna
  // girmez. Eşik sunucuda, sitemap ile AYNI fonksiyon — `seoInput.indexable`
  // yalnız sonucu taşır; hreflang yalnız hazır diller (`readyLocales`).
  return companySeo(seoInput(slug, p), { locale, t: seoT(locale) }).metadata;
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
    indexable: p.indexable !== false,
    updatedAt: p.updatedAt ?? null,
    readyLocales: p.readyLocales,
    sourceLocale: p.sourceLocale,
  };
}

export default async function PublicCompanyProfile({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string;  slug: string }>;
  /** `?urun=` — FİRMA İÇİ ürün araması (spec §7). Ayrı bir ada sahip:
   *  `q` üst çubuktaki genel aramanın parametresi, ikisi karışmamalı. */
  searchParams?: Promise<{ urun?: string; urunSayfa?: string; onizleme?: string }>;
}) {
  const locale = await localeFromParams(params);
  setRequestLocale(locale);
  const t = await getTranslations("web.marketplace.pages");
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
  // Sayfa `searchParams` okuduğu için dinamik: önbelleği ıskalayan çağrı
  // (önizleme, ürün araması, rastgele slug) API'de ziyaretçi başına SSR
  // kovasına sayılsın (derin denetim MU-12/RM-12; `ssr-visitor.ts`).
  await attributeSsrToVisitor();
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
    { locale, t: seoT(locale) },
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
          // Alan alan beyaz liste (kapılı alanlar yazılmaz) + otomatik çeviri
          // notu için `translatedFrom` — tek kaynak (arayüz testi O-018).
          profile={publicProfileViewData(p, locale)}
          actions={
            // Oturumlu üyeye yetki/izin kapısı tıklamadan önce (arayüz testi
            // kapanış S-PUB-ADMIN) — misafir sunucunun giriş bağlantısını
            // görür. Dil farkında Link: ham <a> dil önekini eklemiyor, EN/RU
            // ziyaretçi Türkçe giriş sayfasına düşüyordu (derin denetim LU-22).
            <PublicConnectCta companySlug={slug} panelHref={panelHref} className={CONNECT_CLS}>
              <Link href={loginHref(panelHref)} className={CONNECT_CLS}>
                {t("connectCta")}
              </Link>
            </PublicConnectCta>
          }
          gate={{
            stats: <GatedField label={t("gateStats")} sentence="contact" redirect={panelHref} />,
            aside: (
              <GatedField
                size="box"
                label={t("gateAside")}
                hint={t("gateAsideHint", { name: p.name })}
                /* Üyeye kayıt metni yerine panel karşılığı (GatedField). */
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
