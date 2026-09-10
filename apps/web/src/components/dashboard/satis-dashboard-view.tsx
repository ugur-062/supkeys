"use client";

import { hasAnySeatPermission } from "@/lib/company/permissions";
import { PanelHeroSearch, type PanelSuggestGroup } from "@/components/dashboard/panel-hero-search";
import { CtaBand } from "@/components/dashboard/cta-band";
import { useCategorySegments } from "@/hooks/use-portal-discovery";
import { useSellerTenders } from "@/hooks/use-seller-tenders";
import { SellerTendersView } from "@/components/company/seller-tenders-view";
import { AiIntentBand } from "@/components/dashboard/ai-intent-band";
import { intentToRequestQuery } from "@/lib/company/ai-search";
import { tierAtLeast, type AiSearchIntentResult } from "@rothern/shared";
import { useRouter } from "next/navigation";
import { PackagePlus } from "lucide-react";
import { matchedItemName, rowSegments, searchHaystack } from "@/lib/company/request-facets";

import { useCompanyAuth } from "@/hooks/use-company-auth";
import { SELLER_MARKET } from "@/lib/company/panel-market";
import { HomeCompanyList } from "@/components/dashboard/home-company-list";
import { useMemo, useState } from "react";

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
  const { company, user } = useCompanyAuth();
  const router = useRouter();

  // AI ile ara: "ne sattığınızı anlatın" → açık talep süzgeci (URL) + bant.
  const [intent, setIntent] = useState<AiSearchIntentResult | null>(null);
  const aiEnabled =
    !!company && tierAtLeast(company.tier, "SILVER") &&
    hasAnySeatPermission(user);
  const onAiResult = (r: AiSearchIntentResult) => {
    setIntent(r);
    router.push(`/company/satis${intentToRequestQuery(r)}#acik-talepler`);
  };

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
      for (const seg of rowSegments(row)) m.set(seg, (m.get(seg) ?? 0) + 1);
    }
    return [...m.entries()]
      .map(([id, count]) => ({ id, name: segments.data?.find((sg) => sg.id === id)?.nameTr ?? id, count }))
      .sort((a, b) => b.count - a.count);
  }, [tenders.data, segments.data]);

  // Yazarken öneri: açık talepler (başlık/no/alıcı) + sektörler — liste zaten
  // çekili (`seller-tenders`), ayrı uç yok.
  const [term, setTerm] = useState("");
  // Hero kapsam pili — "Firma" seçiliyken açık talepler yerine firma listesi.
  const [scope, setScope] = useState<"products" | "suppliers">("products");
  const q = term.trim();
  const suggestions: PanelSuggestGroup[] = useMemo(() => {
    if (q.length < 2) return [];
    const lower = q.toLocaleLowerCase("tr-TR");
    const hit = (t: string) => t.toLocaleLowerCase("tr-TR").includes(lower);
    // Talep: başlık · numara · alıcı · KALEM adı · kategori adı (samanlık
    // listeyle AYNI fonksiyondan). Kalemden bulunduysa satır "Kalem: …" der.
    const open = (tenders.data ?? []).filter((t) => t.status === "OPEN");
    const rows = open
      .filter((t) => searchHaystack(t).includes(lower))
      .slice(0, 5)
      .map((t) => {
        const item = matchedItemName(t, q);
        return {
          key: t.id,
          label: t.title,
          meta: item ? `Kalem: ${item}` : (t.owner?.name ?? undefined),
          href: `/company/ilan/${t.id}`,
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
      .map(([id, e]) => ({ key: id, label: e.name, meta: `${e.n} açık talep`, href: `/company/satis?alici=${id}#acik-talepler` }));
    const secs = sectorCounts
      .filter((c) => hit(c.name))
      .slice(0, 3)
      .map((c) => ({ key: c.id, label: c.name, meta: `${c.count} açık talep`, href: `/company/satis?kategori=${c.id}#acik-talepler` }));
    return [
      { label: "Açık talepler", rows },
      { label: "Alıcılar", rows: buyers },
      { label: "Sektörler", rows: secs },
    ];
  }, [q, tenders.data, sectorCounts]);

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
        eyebrow="Satın alma talepleri"
        title="Hangi talebe"
        titleAccent="teklif vereceksiniz?"
        splitTitle
        lead="Kategorinize uygun açık talepler — kapalı zarf, birbirini görmeyen teklifler; kazandırma tek tabloda."
        placeholder="Talep, talep numarası veya firma arayın"
        action="/company/satis"
        /* Aynı kutu iki dizine gider (2026-09-10, kullanıcı isteği —
           satınalmadaki Ürün|Tedarikçi anahtarının satış karşılığı):
           "Talep" → açık talepler listesi, "Firma" → satış firma dizini. */
        supplierScope={{
          action: SELLER_MARKET.companies,
          placeholder: "Firma adı, şehir ya da aldığı kategori arayın",
          label: "Firma",
          primaryLabel: "Talep",
          primaryIcon: "clipboard",
        }}
        onScopeChange={setScope}
        accent="emerald"
        /* Satış sahnesi (kullanıcı varlığı `satıs_foto.png` → webp). */
        backdrop
        backdropSrc="/hero/hero-scene-satis.webp"
        suggestions={suggestions}
        onQueryChange={setTerm}
        ai={{ portal: "satis", enabled: aiEnabled, onResult: onAiResult }}
      />

      {scope === "suppliers" ? (
        /* "Firma" pili seçili: açık talepler yerine FİRMA listesi
           (2026-09-10, kullanıcı kararı). */
        <HomeCompanyList portal="satis" />
      ) : (
        <SellerTendersView
          banner={intent ? <AiIntentBand intent={intent} onDismiss={() => setIntent(null)} /> : null}
        />
      )}

      <CtaBand
        icon={<PackagePlus aria-hidden className="size-5" strokeWidth={1.75} />}
        title="Ürününüz vitrinde mi?"
        body="Ürünlerinizi fiyat ve minimum sipariş bilgisiyle yayımlayın; alıcılar bulsun, bilgi talebi göndersin."
        cta={{ label: "Ürün ekle", href: "/company/satis/urunlerim?yeni=1" }}
        tone="primary"
      />

      {/* Profil/Ürünler sağlık kartları KALDIRILDI (kullanıcı kararı 2026-09-09):
          profil yüzdesi Profilim'de, ürün sayaçları Ürünlerim'de zaten var. */}
    </div>
  );
}
