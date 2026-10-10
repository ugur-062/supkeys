"use client";

import { useTranslations } from "next-intl";
import { userHasPermission } from "@/lib/company/permissions";
import { BUYER_OBJECTS, BUYER_WIDGETS } from "@/lib/company/hero-decor";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { aiSearchAccess, intentToProductQuery, stashAiIntent } from "@/lib/company/ai-search";
import { foldSearchText, type AiSearchIntentResult } from "@rothern/shared";
import { useRouter } from "@/i18n/navigation";
import { PanelHeroSearch, type PanelSuggestGroup } from "@/components/dashboard/panel-hero-search";
import { CategoryShowcaseRows, toShowcaseRows } from "@/components/dashboard/category-showcase-rows";
import { PanelRecommendations } from "@/components/dashboard/panel-recommendations";
import { HomeCompanyList } from "@/components/dashboard/home-company-list";
import { ErrorState } from "@/components/ui/error-state";
import { readHeroScope, writeHeroScope } from "@/lib/company/hero-scope";
import {
  useCategorySegments,
  useDiscoverProductFacets,
  useDiscoverProducts,
} from "@/hooks/use-portal-discovery";
import { useCompanySearch } from "@/hooks/use-company-directory";
import { buildShowcase } from "@/lib/public/category-showcase";
import { PANEL_MARKET, panelCategoryPath, panelCompanyPath, panelProductPath } from "@/lib/company/panel-market";
import { useEffect, useMemo, useState } from "react";

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
  const t = useTranslations("web.panel.market.satinalmaPage");
  // Hero kapsam pili — "Firma" seçiliyken alttaki bölüm firma listesi.
  // Oturum belleğinden geri yüklenir (firma sayfasından GERİ dönüş).
  const [scope, setScopeState] = useState<"products" | "suppliers">("products");
  useEffect(() => {
    const saved = readHeroScope("satinalma");
    if (saved) setScopeState(saved);
  }, []);
  const setScope = (s: "products" | "suppliers") => {
    setScopeState(s);
    writeHeroScope("satinalma", s);
  };
  const { company, user } = useCompanyAuth();
  const canOpenRequest = userHasPermission(user, "buy:listing:manage");
  const router = useRouter();

  // AI ile ara: yorum → ürün süzgeci (URL) + bant. Silver+ ∧ koltuk rolü
  // (asistanla aynı kapı; API `assertAiAccess` aynasıdır). Kilit nedeni
  // paket mi rol mü ayrı taşınır (arayüz testi O-050).
  const aiAccess = aiSearchAccess(company, user);
  const onAiResult = (r: AiSearchIntentResult) => {
    // Yorum ("AI şöyle anladı") URL'ye sığmaz; köprüyle taşınır ve ürün
    // dizini bir kez okur. Süzgeçler URL'de — çipler oradan çizilir.
    stashAiIntent(r);
    router.push(`${PANEL_MARKET.products}${intentToProductQuery(r)}`);
  };

  // Kategori vitrini + çipler: ürün dizini facet'i (L1 sayaçları) + 58 segment.
  const facets = useDiscoverProductFacets();
  const segments = useCategorySegments();
  // 3 satır × (1 promo + 10 kart) = 33 segment. `buildShowcase` sırası:
  // ürünü OLAN dallar önce (sayıya göre), sonra küratörlü sıra — promo
  // kartlara envanteri en dolu üç dal düşer.
  const showcase = useMemo(
    () =>
      buildShowcase({
        segments: (segments.data ?? []).map((s) => ({ id: s.id, name: s.nameTr, slug: s.slug })),
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
  // Vitrin SEKTÖR listesinden kurulur; sayaçlar (facet) yalnız sırayı etkiler.
  // Liste okunamadıysa (kesinti) boş satırlarla "hiçbir şey" çizmek yerine tek
  // satır hata + "Tekrar dene" (son canlı kontrol 2026-10-10, OUTF-3).
  const showcaseFailed = segments.data === undefined && segments.isError;
  const retryShowcase = () => {
    void segments.refetch();
    if (facets.isError) void facets.refetch();
  };

  // Yazarken öneri: ürünler panel keşif ucundan (5), FİRMALAR dizinden (3),
  // kategoriler facet'ten (3) — tek kutu "ürün ya da firma" (Europages).
  const [term, setTerm] = useState("");
  const q = term.trim();
  const sugProducts = useDiscoverProducts({ q, limit: 5 }, q.length >= 2);
  const sugCompanies = useCompanySearch({ q }, q.length >= 2);
  const suggestions: PanelSuggestGroup[] = useMemo(() => {
    if (q.length < 2) return [];
    // Katlanmış karşılaştırma — `tr-TR` küçültme Latin "I"yı "ı" yapıyordu.
    const lower = foldSearchText(q);
    const cats = (facets.data?.categories ?? [])
      .filter((c) => foldSearchText(c.name).includes(lower))
      .slice(0, 3)
      .map((c) => ({ key: c.id, label: c.name, meta: t("urun", { count: c.count }), href: panelCategoryPath(c.id, c.name) }));
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
        meta: [c.city, c.verified ? t("dogrulanmis") : null].filter(Boolean).join(" · ") || undefined,
        href: panelCompanyPath(c.rothernId as string),
      }));
    return [
      { label: t("urunler"), rows: prods },
      { label: t("firmalar"), rows: firms },
      { label: t("kategoriler"), rows: cats },
    ];
  }, [q, facets.data, sugProducts.data, sugCompanies.data, t]);

  return (
    <div className="space-y-10">
      <PanelHeroSearch
        eyebrow={t("kureselTedarikAginiz")}
        /* BAŞLIK (2026-10-08, kullanıcı kararı): soru kipi kalktı — satış
           "Yeni siparişler bulun", alım tarafı karşılığı "Yeni tedarikçiler
           bulun" (herkese açık anasayfanın iki yüzüyle AYNI metin; anahtar adı
           eski Türkçe metinden kaldı, anahtarlar kararlı). Eski soru kipi:
           2026-09-08 kararı.
           Tek renk (siyah), vurgu yok — 2026-09-17 kararı geçerli. */
        title={t("hangiUrunuAriyorsunuz")}
        plainTitle
        lead={t("dogrulanmisTedarikcilerleTanisinIhtiyaclarin")}
        placeholder={t("urunFirmaVeyaSektorArayin")}
        action={PANEL_MARKET.products}
        /* Aynı kutu iki dizine gider (kullanıcı isteği, kaynak kalıp):
           "Ürün" → ürün dizini, "Firma" → firma dizini ("Tedarikçi" →
           "Firma", 2026-09-10 kullanıcı kararı). Pil ayrıca alttaki bölümü
           çevirir (`scope`). */
        supplierScope={{
          action: PANEL_MARKET.companies,
          placeholder: t("firmaAdiSektorYaDa"),
          label: t("firma"),
        }}
        scope={scope}
        onScopeChange={setScope}
        accent="blue"
        /* Sayı bandı KALKTI (kullanıcı kararı): yerine tek satırlık çıkış —
           "bulamadıysan talep aç". Yalnız talep açma yetkisi olana (arayüz
           testi O-079: Yönetici/görüntüleyici "yetki gerekir" sayfasına
           düşüyordu; kenar çubuğundaki aynı düğme zaten gizliydi). */
        ctaNote={
          canOpenRequest
            ? {
                text: t("aradiginizUrunuBulamadinizMi"),
                label: t("talepAc"),
                href: "/company/satinalma/taleplerim/yeni",
              }
            : undefined
        }
        backdrop
        widgets={BUYER_WIDGETS}
        objects={BUYER_OBJECTS}
        suggestions={suggestions}
        onQueryChange={setTerm}
        ai={{ portal: "satinalma", ...aiAccess, onResult: onAiResult }}
      />

      {scope === "suppliers" ? (
        /* "Firma" pili seçili: ürün bölümleri yerine FİRMA listesi
           (2026-09-10, kullanıcı kararı). */
        <HomeCompanyList portal="satinalma" />
      ) : (
        <>
          {/* Tavsiye şeridi arama kutusunun HEMEN ALTINDA: kullanıcı aramadan
              önce de bir öneri görsün (son araması varsa ona göre, yoksa alım
              kategorilerine göre). */}
          <PanelRecommendations mode="match" />

          {showcaseFailed ? (
            <ErrorState compact message={t("kategoriVitriniYuklenemedi")} onRetry={retryShowcase} />
          ) : (
            <CategoryShowcaseRows
              rows={rows}
              hrefFor={(c) => panelCategoryPath(c.id, c.name)}
              ctaLabel={t("simdiTedarikciBulun")}
            />
          )}

          {/* Vitrinin altında İKİNCİ şerit — üsttekiyle aynı listeyi basmasın
              diye farklı kesit: yeni eklenenler. */}
          <PanelRecommendations mode="fresh" />
        </>
      )}
    </div>
  );
}
