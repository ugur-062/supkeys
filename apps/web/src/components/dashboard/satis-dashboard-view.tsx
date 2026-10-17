"use client";

import { useTranslations } from "next-intl";
import { userHasPermission } from "@/lib/company/permissions";
import { PanelHeroSearch, type PanelSuggestGroup } from "@/components/dashboard/panel-hero-search";
import { CtaBand } from "@/components/dashboard/cta-band";
import { useCategorySegments } from "@/hooks/use-portal-discovery";
import { maskedRequestHref, useSellerTenders } from "@/hooks/use-seller-tenders";
import { SellerTendersView } from "@/components/company/seller-tenders-view";
import { AiIntentBand } from "@/components/dashboard/ai-intent-band";
import { aiSearchAccess, intentToRequestQuery } from "@/lib/company/ai-search";
import { segmentOf } from "@/lib/company/request-filter-params";
import { foldSearchText, isHiddenCategory, type AiSearchIntentResult } from "@rothern/shared";
import { useRouter } from "@/i18n/navigation";
import { PackagePlus } from "lucide-react";
import { SELLER_OBJECTS, SELLER_WIDGETS } from "@/lib/company/hero-decor";
import { matchedItemName, rowSegments, searchHaystack } from "@/lib/company/request-facets";

import { useCompanyAuth } from "@/hooks/use-company-auth";
import { SELLER_MARKET } from "@/lib/company/panel-market";
import { HomeCompanyList } from "@/components/dashboard/home-company-list";
import { FreePeriodNotice } from "@/components/company/free-period-notice";
import { readHeroScope, writeHeroScope } from "@/lib/company/hero-scope";
import { useEffect, useMemo, useState } from "react";
import { useScrollToHash } from "@/hooks/use-scroll-to-hash";

/**
 * Satış panosu. Sıra yukarıdan aşağı:
 *   1. arama kutusu — açık talepleri arar (`?q=`), yazarken öneri
 *   2. AÇIK TALEPLER — kenar süzgeçli TAM liste (ayrı sayfa yok)
 *   3. ürün ekle şeridi (primary — satış menüsünde CTA yok)
 *   4. profil & katalog sağlığı — eşleşme kalitesinin girdileri
 * Grafikler Raporlar'da; "Son Aktiviteler" (2026-08-03), "Başlangıç" listesi,
 * sektör çipleri/kartları ve alıcı bloğu kullanıcı isteğiyle kaldırıldı.
 * BAŞLIK ŞERİDİ ve "BUGÜN" bandı (bekleyen işler + 4 KPI) 2026-09-07'de
 * kullanıcı kararıyla kaldırıldı: ikisi de Şirketim › Genel Bakış'ta tam
 * hâliyle yaşıyor, anasayfa açık taleplere ayrıldı.
 */
export function SatisDashboardView() {
  const t = useTranslations("web.panel.shell.satisDashboardView");
  const { company, user } = useCompanyAuth();
  const router = useRouter();

  // AI ile ara: "ne sattığınızı anlatın" → açık talep süzgeci (URL) + bant.
  // Kapı ve kilit nedeni (paket / rol) tek yardımcıdan (arayüz testi O-050).
  const [intent, setIntent] = useState<AiSearchIntentResult | null>(null);
  const aiAccess = aiSearchAccess(company, user);
  // "Ürün ekle" şeridi yalnız ürün yönetme izniyle (arayüz testi O-099):
  // görüntüleyici `?yeni=1` formuna gönderiliyordu.
  const canManageProducts = userHasPermission(user, "sell:product:manage");

  // Öneri için sektör sayaçları: listenin KENDİSİNDEN (aynı görünürlük, ek
  // uç yok). Sektör çipleri ve fotoğraflı sektör kartları KALDIRILDI
  // (2026-09-05, kullanıcı: "gerek yok" — kategori süzgeci listenin
  // kenarında, sayaçlı).
  const segments = useCategorySegments();
  const tenders = useSellerTenders();
  const sectorCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const row of tenders.data ?? []) {
      if (row.status !== "OPEN") continue;
      for (const seg of rowSegments(row)) {
        // Gizli sektör ÖNERİLMEZ (2026-10-09; kenar süzgecindeki sayaçla aynı
        // kural — `request-facets`): adı sektör listesinde olmadığından ham
        // kodla ("77000000 · 2 açık talep") öneriliyor, bağlantısı da listeyi
        // gizli sektöre süzüyordu. Satırlar kancadan süzülü gelir; ikinci kat.
        // Görünür sektörün gizli dalı (2026-10-10; `46101500`) buraya hiç
        // ulaşmaz: `rowSegments` kodu sektöre yuvarlamadan ÖNCE düşürür.
        if (isHiddenCategory(seg)) continue;
        m.set(seg, (m.get(seg) ?? 0) + 1);
      }
    }
    return [...m.entries()]
      .map(([id, count]) => ({ id, name: segments.data?.find((sg) => sg.id === id)?.nameTr ?? id, count }))
      .sort((a, b) => b.count - a.count);
  }, [tenders.data, segments.data]);

  // Yazarken öneri: açık talepler (başlık/no/alıcı) + sektörler — liste zaten
  // çekili (`seller-tenders`), ayrı uç yok.
  const [term, setTerm] = useState("");
  // Hero kapsam pili — "Firma" seçiliyken açık talepler yerine firma listesi.
  const [scope, setScopeState] = useState<"products" | "suppliers">("products");
  useEffect(() => {
    const saved = readHeroScope("satis");
    // `#acik-talepler` bağlantısı açık talepleri ister: kayıtlı "Firma"
    // kapsamı listeyi gizleyip bağlantıyı boşa düşürmesin.
    if (saved && !(saved === "suppliers" && window.location.hash === "#acik-talepler")) {
      setScopeState(saved);
    }
  }, []);
  // `/company/satis#acik-talepler` (Şirketim KPI'ları, bekleyen işler, boş
  // durum CTA'ları): bölüm verisi istemcide geldiği için tarayıcının/Next'in
  // çapa kaydırması ilk boyamada bölümü bulamıyor ya da düzen oturmadan
  // kaydırıyordu (webC-04 yeniden doğrulama) → liste gelince bir kez kaydır.
  useScrollToHash(!!tenders.data || tenders.isError);
  const setScope = (s: "products" | "suppliers") => {
    setScopeState(s);
    writeHeroScope("satis", s);
  };
  const onAiResult = (r: AiSearchIntentResult) => {
    setIntent(r);
    // Sonuç AÇIK TALEPLERDE görünür: "Firma" kapsamı açık kaldıysa firma
    // listesi bandı ve süzülmüş talepleri örtüyordu (arayüz testi O-095).
    setScope("products");
    router.push(`/company/satis${intentToRequestQuery(r)}#acik-talepler`);
  };
  const q = term.trim();
  const suggestions: PanelSuggestGroup[] = useMemo(() => {
    // "Firma" kapsamında talep/alıcı önerisi YOK (arayüz testi O-095): kutu
    // firma dizinine gider, talep önerisi yanlış yere çağırıyordu.
    if (q.length < 2 || scope === "suppliers") return [];
    // Katlanmış sorgu — samanlık (`searchHaystack`) da katlı; `tr-TR` küçültme
    // "Çelik"i "çelik" bırakıp katlı "celik"te bulamıyordu.
    const lower = foldSearchText(q);
    const hit = (t: string) => foldSearchText(t).includes(lower);
    // Talep: başlık · numara · alıcı · KALEM adı · kategori adı (samanlık
    // listeyle AYNI fonksiyondan). Kalemden bulunduysa satır "Kalem: …" der.
    const open = (tenders.data ?? []).filter((t) => t.status === "OPEN");
    const rows = open
      .filter((t) => searchHaystack(t).includes(lower))
      .slice(0, 5)
      .map((row) => {
        const item = matchedItemName(row, q);
        return {
          key: row.id,
          label: row.title,
          // Maskeli satır (ücretsiz üye, alıcı gizli): ad yok, panel içi maskeli görünüm.
          meta: item ? t("kalemMeta", { item }) : (row.owner?.name ?? (row.masked ? t("aliciGizli") : undefined)),
          href: row.masked ? maskedRequestHref(row.number ?? "") : `/company/ilan/${row.id}`,
        };
      });
    // Alıcı firmalar (açık talep sayısıyla) → listeyi o alıcıya süzer.
    const buyerMap = new Map<string, { name: string; n: number }>();
    for (const t of open) {
      if (!t.owner?.id || !hit(t.owner.name)) continue;
      const e = buyerMap.get(t.owner.id) ?? { name: t.owner.name, n: 0 };
      e.n += 1;
      buyerMap.set(t.owner.id, e);
    }
    const buyers = [...buyerMap.entries()]
      .sort((a, b) => b[1].n - a[1].n)
      .slice(0, 3)
      .map(([id, e]) => ({ key: id, label: e.name, meta: t("acikTalep", { n: e.n }), href: `/company/satis?alici=${id}#acik-talepler` }));
    const secs = sectorCounts
      .filter((c) => hit(c.name))
      .slice(0, 3)
      .map((c) => ({ key: c.id, label: c.name, meta: t("acikTalep2", { count: c.count }), href: `/company/satis?kategori=${c.id}#acik-talepler` }));
    return [
      { label: t("acikTalepler"), rows },
      { label: t("alicilar"), rows: buyers },
      { label: t("sektorler"), rows: secs },
    ];
  }, [q, scope, tenders.data, sectorCounts]);

  return (
    <div className="space-y-10">
      {/* SIRA: arama (öneriyle) → AÇIK TALEPLER (kenar süzgeçli tam liste)
          → ürün ekle şeridi → katalog/profil sağlığı. Sektör çipleri,
          fotoğraflı sektör kartları
          ve "Talep açan alıcılar" bloğu KALDIRILDI: kategori ve alıcı artık
          listenin kenar süzgecinde sayaçlı — aynı bilgiyi ikinci kez basmak
          sayfayı kalabalıklaştırıyordu. */}
      <PanelHeroSearch
        /* Üst etiket "AÇIK" olmadan (kullanıcı kararı 2026-09-08): panelde
           listelenen zaten açık talepler, sıfat gürültü. */
        eyebrow={t("satinAlmaTalepleri")}
        /* 2026-09-17, kullanıcı kararı: başlık tek renk (siyah), vurgu yok. */
        title={t("hangiTalebeTeklifVereceksiniz")}
        plainTitle
        lead={t("kategorinizeUygunAcikTaleplerKapali")}
        placeholder={t("talepTalepNumarasiVeyaFirma")}
        action="/company/satis"
        /* Aynı kutu iki dizine gider (2026-09-10, kullanıcı isteği —
           satınalmadaki Ürün|Tedarikçi anahtarının satış karşılığı):
           "Talep" → açık talepler listesi, "Firma" → satış firma dizini. */
        supplierScope={{
          action: SELLER_MARKET.companies,
          placeholder: t("firmaAdiSehirYaDa"),
          label: t("firma"),
          primaryLabel: t("talep"),
          primaryIcon: "clipboard",
        }}
        scope={scope}
        onScopeChange={setScope}
        accent="emerald"
        backdrop
        widgets={SELLER_WIDGETS}
        objects={SELLER_OBJECTS}
        suggestions={suggestions}
        onQueryChange={setTerm}
        ai={{ portal: "satis", ...aiAccess, onResult: onAiResult }}
      />

      {/* Ücretsiz dönem (2026-10-07): doğrulanmamış firma girişte bu sayfaya
          düşer — kısa "ücretsiz + yalnızca doğrulama" cümlesi burada bir kez. */}
      <FreePeriodNotice />

      {scope === "suppliers" ? (
        /* "Firma" pili seçili: açık talepler yerine FİRMA listesi
           (2026-09-10, kullanıcı kararı). */
        <HomeCompanyList portal="satis" />
      ) : (
        <SellerTendersView
          banner={
            intent ? (
              <AiIntentBand
                intent={intent}
                onDismiss={() => setIntent(null)}
                /* Süzgeç SEGMENT'e iner — çip de segment adını yazar (D-276). */
                categoryLabel={(code) => segments.data?.find((sg) => sg.id === segmentOf(code))?.nameTr}
              />
            ) : null
          }
        />
      )}

      {canManageProducts ? (
        <CtaBand
          icon={<PackagePlus aria-hidden className="size-5" strokeWidth={1.75} />}
          title={t("urununuzVitrindeMi")}
          body={t("urunleriniziFiyatVeMinimumSiparis")}
          cta={{ label: t("urunEkle"), href: "/company/satis/urunlerim?yeni=1" }}
          tone="primary"
        />
      ) : null}

      {/* Profil/Ürünler sağlık kartları KALDIRILDI (kullanıcı kararı 2026-09-09):
          profil yüzdesi Profilim'de, ürün sayaçları Ürünlerim'de zaten var. */}
    </div>
  );
}
