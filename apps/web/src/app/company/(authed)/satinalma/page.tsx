"use client";

import { hasAnySeatPermission } from "@/lib/company/permissions";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { PanelFeaturedProducts } from "@/components/company/market/panel-featured-products";
import { intentToProductQuery, stashAiIntent } from "@/lib/company/ai-search";
import { tierAtLeast, type AiSearchIntentResult } from "@rothern/shared";
import { useRouter } from "next/navigation";
import { PanelHeroSearch, type PanelSuggestGroup } from "@/components/dashboard/panel-hero-search";
import { CategoryShowcasePanel } from "@/components/dashboard/category-showcase-panel";
import { FeaturedCompaniesBlock } from "@/components/dashboard/featured-companies-block";
import { CtaBand } from "@/components/dashboard/cta-band";
import { SellerHealthCards } from "@/components/dashboard/seller-health-cards";
import {
  useCategorySegments,
  useDiscoverProductFacets,
  useDiscoverProducts,
} from "@/hooks/use-portal-discovery";
import { useCompanySearch } from "@/hooks/use-company-directory";
import { buildShowcase } from "@/lib/public/category-showcase";
import { PANEL_MARKET, panelCategoryPath, panelCompanyPath, panelProductPath } from "@/lib/company/panel-market";
import { ArrowRight, ClipboardList } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

/**
 * SATINALMA ANASAYFASI — pazar GİRİŞİ (2026-09-07, pazar katmanı brifi).
 *
 * Anasayfa artık ürün ızgarası TAŞIMAZ: liste kendi adresine taşındı
 * (`/company/satinalma/urunler`). Gerekçe kullanıcının canlı incelemesi —
 * sayfa hem panel hem katalog olmaya çalışınca ikisi de okunmuyordu,
 * kategori kartı yalnız sayfayı kaydırdığı için filtrelenmiş liste
 * paylaşılamıyordu.
 *
 * Sıra: hero arama → kategoriler (artık NAVİGASYON: kendi sayfasına gider)
 * → size uygun ürünler şeridi → doğrulanmış tedarikçiler → talep aç şeridi
 * → profil sağlığı → Raporlar.
 *
 * BAŞLIK ŞERİDİ ve "BUGÜN" bandı KALDIRILDI (2026-09-07, kullanıcı kararı):
 * panel adı sol menüde zaten yazılı, kur çipi ve bekleyen işler listesi
 * Şirketim › Genel Bakış'ta tam hâliyle yaşıyor. Anasayfa pazar girişidir;
 * "bugün ne yapmalıyım" bloğu ilk ekranı arama kutusundan çalıyordu.
 *
 * Sayfada TEK primary CTA (sol menü). Herkese açık uçlar panelde
 * KULLANILMAZ.
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

  // Kategori vitrini + çipler: ürün dizini facet'i (L1 sayaçları) + 58 segment.
  const facets = useDiscoverProductFacets();
  const segments = useCategorySegments();
  const showcase = useMemo(
    () =>
      buildShowcase({
        segments: (segments.data ?? []).map((s) => ({ id: s.id, name: s.nameTr })),
        counts: (facets.data?.categories ?? []).map((c) => ({ id: c.id, count: c.count })),
        productCovers: [],
        limit: 8,
      }),
    [segments.data, facets.data],
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

  return (
    <div className="space-y-10">
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

      <CategoryShowcasePanel
        title="Kategoriye göre keşfet"
        lead="En çok ürünü olan dallar önde; her kategorinin kendi sayfası ve kendi süzgeçleri var."
        items={showcase}
        hrefFor={(id) => panelCategoryPath(id, showcase.find((c) => c.id === id)?.name)}
        countNoun="ürün"
        allHref={PANEL_MARKET.products}
        allLabel="Tüm ürünler"
      />

      <PanelFeaturedProducts />

      <FeaturedCompaniesBlock />


      <CtaBand
        icon={<ClipboardList aria-hidden className="size-5" strokeWidth={1.75} />}
        title="Aradığınızı bulamadınız mı?"
        body="Satın alma talebi açın; kategorinizdeki tedarikçiler kapalı zarfta teklif versin, siz tek tabloda karşılaştırın."
        cta={{ label: "Talep aç", href: "/company/satinalma/taleplerim/yeni" }}
        tone="secondary"
      />

      {/* Eşleşme kalitesinin girdisi: profil tamlığı (yüzde Profilim'le aynı
          fonksiyondan). Katalog kartı alıcıda yok. */}
      <SellerHealthCards mode="profile" profileHref="/company/sirketim/profil" />

      <Link
        href="/company/sirketim/raporlar"
        className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-900 hover:text-zinc-600"
      >
        Detaylı analiz ve grafikler Raporlar&apos;da
        <ArrowRight aria-hidden className="size-4" />
      </Link>
    </div>
  );
}
