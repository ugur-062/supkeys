"use client";

import { hasAnySeatPermission } from "@/lib/company/permissions";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { intentToProductQuery, stashAiIntent } from "@/lib/company/ai-search";
import { tierAtLeast, type AiSearchIntentResult } from "@rothern/shared";
import { useRouter } from "next/navigation";
import { PanelHeroSearch, type PanelSuggestGroup } from "@/components/dashboard/panel-hero-search";
import { CategoryGrid } from "@/components/marketplace/category-grid";
import { CompanyGrid } from "@/components/marketplace/company-grid";
import { HowItWorksFlow } from "@/components/marketplace/how-it-works-flow";
import { PopularChips } from "@/components/marketplace/popular-chips";
import { ProductShowcase } from "@/components/marketplace/product-showcase";
import { StatsRow } from "@/components/marketplace/stats-strip";
import { TwoCards } from "@/components/marketplace/two-cards";
import {
  useCategorySegments,
  useDiscoverProductFacets,
  useDiscoverProducts,
  useDiscoverSearch,
} from "@/hooks/use-portal-discovery";
import { useCompanySearch } from "@/hooks/use-company-directory";
import { buildShowcase } from "@/lib/public/category-showcase";
import { PANEL_MARKET, panelCategoryPath, panelCompanyPath, panelProductPath } from "@/lib/company/panel-market";
import { useMemo, useState } from "react";

/**
 * SATINALMA ANASAYFASI = www.rothern.com anasayfasının ALICI yüzü
 * (2026-09-07, kullanıcı kararı: "oradaki ile birebir aynı olsun").
 *
 * Bölümler ve SIRA herkese açık anasayfayla aynı; bileşenler de AYNI
 * dosyalar (`ProductShowcase`, `CategoryGrid`, `TwoCards`, `CompanyGrid`,
 * `PopularChips`, `HowItWorksFlow`). Ayrışmasınlar diye kopya çıkarılmadı:
 * rota ve kopya farkları prop olarak geçiliyor.
 *
 * ÜÇ ZORUNLU FARK (uydurma değil, olgu):
 *  1. VERİ panelin kendi uçlarından gelir — pazar yerinin herkese açık
 *     uçları panelde KULLANILMAZ (anahtar kapalıyken boş dönerler ve
 *     davet/bağlantı görünürlüğünü taşımazlar).
 *  2. KAYIT CTA'ları yok: kullanıcı zaten üye. "Kaydol" yerine panel
 *     eylemleri (talep aç · ürün ekle) — `TwoCards variant="panel"`.
 *  3. Sayı şeridi HAREKET değil ENVANTER: "bu hafta eklenen ürün / son 24
 *     saatte teklif" `public/stats` ucundan geliyor ve panelde o uç
 *     çağrılamaz. Panelde ölçülebilen üç gerçek sayı basılır; uydurma
 *     hareket metriği basmaktansa envanteri dürüstçe yazmak doğru.
 *
 * Hero panelin KENDİ arama bloğu kalır (kullanıcı kararı): public hero'nun
 * Alıcı/Tedarikçi anahtarı sol menüdeki portal pilinin kopyası olurdu,
 * "Kaydol" düğmesi de anlamsız; buna karşılık "AI ile ara" (Silver+) yalnız
 * panelde var.
 */
export default function SatinalmaDashboardPage() {
  const { company, user } = useCompanyAuth();
  const router = useRouter();

  // AI ile ara: yorum → ürün süzgeci (URL) + bant. Silver+ ∧ koltuk rolü
  // (asistanla aynı kapı; API `assertAiAccess` aynasıdır).
  const aiEnabled =
    !!company && tierAtLeast(company.tier, "SILVER") &&
    hasAnySeatPermission(user);
  const onAiResult = (r: AiSearchIntentResult) => {
    // Yorum ("AI şöyle anladı") URL'ye sığmaz; köprüyle taşınır ve ürün
    // dizini bir kez okur. Süzgeçler URL'de — çipler oradan çizilir.
    stashAiIntent(r);
    router.push(`${PANEL_MARKET.products}${intentToProductQuery(r)}`);
  };

  // ÜÇ KESİT, TEK KAYDIRICI (public ile aynı): öne çıkan · yeni · fiyatı
  // yazılı. "Öne çıkan" panelde UYGUNLUK sırasıdır — sunucu, firmanın alım
  // kategorileriyle örtüşen ürünleri öne alır (kartta rozet).
  const featured = useDiscoverSearch({ pageSize: 12 });
  const newest = useDiscoverSearch({ sort: "newest", pageSize: 12 });
  const priced = useDiscoverSearch({ price: "has", sort: "price", pageSize: 12 });

  // Kategori vitrini + popüler çipler: ürün dizini facet'i (L1 sayaçları) + 58 segment.
  const facets = useDiscoverProductFacets();
  const segments = useCategorySegments();
  const directory = useCompanySearch({ hasProducts: true });

  const showcase = useMemo(
    () =>
      buildShowcase({
        segments: (segments.data ?? []).map((s) => ({ id: s.id, name: s.nameTr })),
        counts: (facets.data?.categories ?? []).map((c) => ({ id: c.id, count: c.count })),
        // Fotoğrafı olmayan dalda kapak ürün görselinden gelir (public ile aynı).
        productCovers: [...(featured.data?.items ?? []), ...(newest.data?.items ?? [])].map((p) => ({
          categoryId: p.categoryId,
          image: p.images[0],
        })),
        limit: 12,
      }),
    [segments.data, facets.data, featured.data, newest.data],
  );

  // "Yeni" sekmesi öne çıkanları TEKRARLAMASIN (public ile aynı kural).
  const featuredKeys = new Set((featured.data?.items ?? []).map((p) => `${p.company.slug}/${p.slug}`));
  const newestOnly = (newest.data?.items ?? []).filter((p) => !featuredKeys.has(`${p.company.slug}/${p.slug}`));

  const popular = useMemo(
    () =>
      [...(facets.data?.categories ?? [])]
        .sort((a, b) => b.count - a.count)
        .slice(0, 12)
        .map((c) => ({ id: c.id, name: c.name, count: c.count })),
    [facets.data],
  );

  // Yazarken öneri: ürünler panel keşif ucundan (5), FİRMALAR dizinden (3),
  // kategoriler facet'ten (3) — tek kutu "ürün ya da firma" (Europages).
  const [term, setTerm] = useState("");
  const q = term.trim();
  const sugProducts = useDiscoverProducts({ q, limit: 5 }, q.length >= 2);
  const sugCompanies = useCompanySearch({ q }, q.length >= 2);
  const suggestions: PanelSuggestGroup[] = useMemo(() => {
    if (q.length < 2) return [];
    const lower = q.toLocaleLowerCase("tr-TR");
    const cats = (facets.data?.categories ?? [])
      .filter((c) => c.name.toLocaleLowerCase("tr-TR").includes(lower))
      .slice(0, 3)
      .map((c) => ({ key: c.id, label: c.name, meta: `${c.count} ürün`, href: panelCategoryPath(c.id, c.name) }));
    const prods = (sugProducts.data ?? []).slice(0, 5).map((p) => ({
      key: `${p.company.slug}/${p.slug}`,
      label: p.name,
      meta: p.company.name,
      href: panelProductPath(p.company.slug, p.slug),
    }));
    const firms = (sugCompanies.data?.items ?? [])
      .filter((c) => c.connectionStatus !== "self" && c.rothernId)
      .slice(0, 3)
      .map((c) => ({
        key: c.slug,
        label: c.name,
        meta: [c.city, c.verified ? "Doğrulanmış" : null].filter(Boolean).join(" · ") || undefined,
        href: panelCompanyPath(c.rothernId as string),
      }));
    return [
      { label: "Ürünler", rows: prods },
      { label: "Firmalar", rows: firms },
      { label: "Kategoriler", rows: cats },
    ];
  }, [q, facets.data, sugProducts.data, sugCompanies.data]);

  // ENVANTER şeridi — üç gerçek sayı. 0 olan satır basılmaz, ikiden az
  // kalırsa şerit hiç çizilmez (`StatsRow`).
  const stats = [
    { n: featured.data?.total ?? 0, l: "Pazardaki ürün" },
    { n: directory.data?.total ?? 0, l: "Vitrini yayında firma" },
    { n: facets.data?.categories.length ?? 0, l: "Ürün olan sektör" },
  ].filter((i) => i.n > 0);

  return (
    /* Bölümler kendi dikey boşluklarını taşıyor (public anasayfayla aynı
       bileşenler) — kabuk `space-y` vermez, iki kez boşluk olurdu. */
    <div className="-mx-4 sm:-mx-6 lg:-mx-8 xl:-mx-10">
      <div className="px-4 sm:px-6 lg:px-8">
        <PanelHeroSearch
          eyebrow="Tedarikçi ürün vitrini"
          title="Ne arıyorsunuz?"
          lead="Ürün, marka, parça numarası veya firma — doğrulanmış tedarikçilerin vitrininden, fiyat ve minimum sipariş bilgisiyle."
          placeholder="Ürün, marka, parça numarası veya firma arayın"
          action={PANEL_MARKET.products}
          accent="blue"
          suggestions={suggestions}
          onQueryChange={setTerm}
          ai={{ portal: "satinalma", enabled: aiEnabled, onResult: onAiResult }}
        />
      </div>

      <StatsRow label="Pazarda şu an" items={stats} />

      <HowItWorksFlow
        links={{
          browse: PANEL_MARKET.products,
          create: "/company/satinalma/taleplerim/yeni",
          help: "/nasil-calisir",
        }}
      />

      <ProductShowcase
        heading="Ürünler"
        lead="Doğrulanmış firmaların vitrinlerinden — fiyat ve minimum sipariş bilgisiyle. Alım kategorinize uyanlar önde."
        hrefFor={(p) => panelProductPath(p.company.slug, p.slug)}
        cta="Bilgi iste"
        accent="blue"
        groups={[
          {
            key: "one-cikan",
            label: "Öne çıkan",
            items: featured.data?.items ?? [],
            href: PANEL_MARKET.products,
            hrefLabel: "Tüm ürünler",
          },
          {
            key: "yeni",
            label: "Yeni",
            items: newestOnly,
            href: `${PANEL_MARKET.products}?sirala=yeni`,
            hrefLabel: "Yeni ürünler",
          },
          {
            key: "fiyatli",
            label: "Fiyatı yazılı",
            items: priced.data?.items ?? [],
            href: `${PANEL_MARKET.products}?fiyat=var&sirala=fiyat`,
            hrefLabel: "Fiyatlı ürünler",
          },
        ]}
      />

      <CategoryGrid
        categories={showcase}
        hrefFor={(c) => panelCategoryPath(c.id, c.name)}
        allHref={PANEL_MARKET.products}
      />

      <TwoCards variant="panel" />

      <CompanyGrid
        companies={directory.data?.items ?? []}
        hrefFor={(c) => panelCompanyPath(c.rothernId ?? c.slug)}
        allHref={PANEL_MARKET.companies}
      />

      <PopularChips
        items={popular}
        hrefFor={(c) => panelCategoryPath(c.id, c.name)}
        allHref={PANEL_MARKET.products}
      />

      <section className="mx-auto max-w-7xl px-6 pb-14 lg:px-8">
        <p className="max-w-3xl text-sm/6 text-zinc-500">
          Bu sayfa firmanızın satın alma tarafıdır: üretici, distribütör ve hizmet sağlayıcı firmaların
          ürünlerini fiyat ve minimum sipariş bilgisiyle inceleyin, doğrudan bilgi isteyin; aradığınızı
          bulamazsanız satın alma talebi açın, kategorinizle eşleşen tedarikçiler kapalı zarf teklif versin.
        </p>
      </section>
    </div>
  );
}
