"use client";

import { hasAnySeatPermission } from "@/lib/company/permissions";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { intentToProductQuery, stashAiIntent } from "@/lib/company/ai-search";
import { tierAtLeast, type AiSearchIntentResult } from "@rothern/shared";
import { useRouter } from "next/navigation";
import { PanelHeroSearch, type PanelSuggestGroup } from "@/components/dashboard/panel-hero-search";
import { CategoryShowcaseRows, toShowcaseRows } from "@/components/dashboard/category-showcase-rows";
import { PanelRecommendations } from "@/components/dashboard/panel-recommendations";
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
 * SATINALMA ANASAYFASI — pazar GİRİŞİ (2026-09-07, pazar katmanı brifi).
 *
 * Anasayfa artık ürün ızgarası TAŞIMAZ: liste kendi adresine taşındı
 * (`/company/satinalma/urunler`). Gerekçe kullanıcının canlı incelemesi —
 * sayfa hem panel hem katalog olmaya çalışınca ikisi de okunmuyordu,
 * kategori kartı yalnız sayfayı kaydırdığı için filtrelenmiş liste
 * paylaşılamıyordu.
 *
 * SAYFA (2026-09-07, kullanıcı kararı — Europages ekran görüntüsü):
 * hero arama → ÜRÜN TAVSİYESİ şeridi → KATEGORİ VİTRİNİ (3 satır) →
 * ikinci tavsiye şeridi. Başka blok yok.
 *
 * Kaldırılanlar: "size uygun ürünler" şeridi, doğrulanmış tedarikçiler,
 * "talep aç" şeridi, profil sağlığı kartı ve Raporlar bağlantısı. Hepsi
 * kendi adreslerinde yaşamaya devam ediyor (ürünler ve firmalar pazar
 * sekmelerinde, talep sihirbazı sol menüdeki birincil CTA'da, profil ve
 * raporlar Şirketim altında); anasayfa artık tek bir soruyu soruyor:
 * "ne arıyorsun, hangi daldan?". Geri getirmek her biri için tek satır.
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
  /* Hero'nun üç olgusu ve sektör kısayolları GERÇEK envanterden: ürün ve
     firma toplamı tek satırlık sorgularla (react-query önbelleğinde dizin
     sayfalarıyla paylaşılır), sektör sayısı ürünü OLAN L1 dalların sayısı.
     Şişirilmiş "200+ ülke / milyonlarca ürün" yazılmaz. */
  const productTotal = useDiscoverSearch({ pageSize: 1 });
  /* `{}` DEĞİL `{ hasProducts: true }`: öneri hook'u `useCompanySearch({ q })`
     ile aynı sorgu anahtarına düşüyordu (serileştirmede `undefined` alanlar
     atlanır) ve o hook `enabled:false` olduğu için sorgu HİÇ koşmuyordu —
     "Tedarikçi firma" sayısı bu yüzden boş geliyordu (canlı ekranda
     görüldü). Ayrı anahtar + anlamlı süzgeç: vitrini dolu tedarikçiler. */
  const companyTotal = useCompanySearch({ hasProducts: true });
  const segments = useCategorySegments();
  // 3 satır × (1 promo + 10 kart) = 33 segment. `buildShowcase` sırası:
  // ürünü OLAN dallar önce (sayıya göre), sonra küratörlü sıra — promo
  // kartlara envanteri en dolu üç dal düşer.
  const showcase = useMemo(
    () =>
      buildShowcase({
        segments: (segments.data ?? []).map((s) => ({ id: s.id, name: s.nameTr })),
        counts: (facets.data?.categories ?? []).map((c) => ({ id: c.id, count: c.count })),
        productCovers: [],
        // TÜM ana kategoriler (58 segment) — kullanıcı kararı 2026-09-08.
        // Sıra `buildShowcase`ten: ürünü olan dallar önce, sonra küratörlü sıra.
        limit: 100,
      }),
    [segments.data, facets.data],
  );
  // 6 blok × (1 promo + 10 kategori) = 66 yuva; artan segmentler son bloğun
  // ızgarasına eklenir (`toShowcaseRows`), hiçbiri düşmez.
  const rows = useMemo(() => toShowcaseRows(showcase, 6), [showcase]);

  const heroStats = [
    productTotal.data?.total
      ? { label: "Yayında ürün", value: productTotal.data.total.toLocaleString("tr-TR"), icon: "globe" as const }
      : null,
    companyTotal.data?.total
      ? { label: "Vitrini yayında tedarikçi", value: companyTotal.data.total.toLocaleString("tr-TR"), icon: "building" as const }
      : null,
    (facets.data?.categories ?? []).length
      ? {
          label: "Ürün olan sektör",
          value: String((facets.data?.categories ?? []).filter((c) => c.count > 0).length),
          icon: "cube" as const,
        }
      : null,

  ].filter(Boolean) as { label: string; value: string; icon: "globe" | "building" | "users" | "cube" }[];
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
        eyebrow="Küresel tedarik ağınız"
        title="Daha güçlü iş bağlantıları"
        titleAccent="daha büyük fırsatlar"
        lead="Doğrulanmış tedarikçilerle tanışın, ihtiyaçlarınızı paylaşın, işinizi büyütün."
        placeholder="Ürün, firma veya sektör arayın..."
        action={PANEL_MARKET.products}
        /* Aynı kutu iki dizine gider (kullanıcı isteği, kaynak kalıp):
           "Ürün" → ürün dizini, "Tedarikçi" → firma dizini. */
        supplierScope={{
          action: PANEL_MARKET.companies,
          placeholder: "Firma adı, sektör ya da sattığı ürün arayın",
          label: "Tedarikçi",
        }}
        accent="blue"
        stats={heroStats}
        statsCta={{ label: "Doğru tedarikçiyle daha fazlasını mümkün kılın", href: PANEL_MARKET.companies }}
        /* Dekoratif arka plan katmanları (dünya haritası · depo · gemi ·
           uçak). Yalnız satınalma hero'sunda; satış portalı sade kalır. */
        backdrop
        suggestions={suggestions}
        onQueryChange={setTerm}
        ai={{ portal: "satinalma", enabled: aiEnabled, onResult: onAiResult }}
      />

      {/* Tavsiye şeridi arama kutusunun HEMEN ALTINDA: kullanıcı aramadan
          önce de bir öneri görsün (son araması varsa ona göre, yoksa alım
          kategorilerine göre). */}
      <PanelRecommendations mode="match" />

      <CategoryShowcaseRows
        rows={rows}
        hrefFor={(c) => panelCategoryPath(c.id, c.name)}
        countNoun="ürün"
        ctaLabel="Şimdi tedarikçi bulun"
      />

      {/* Vitrinin altında İKİNCİ şerit — üsttekiyle aynı listeyi basmasın
          diye farklı kesit: yeni eklenenler. */}
      <PanelRecommendations mode="fresh" />
    </div>
  );
}
