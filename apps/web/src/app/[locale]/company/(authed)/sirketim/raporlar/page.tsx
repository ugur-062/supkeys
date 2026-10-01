"use client";

import { useTranslations } from "next-intl";
import { HubList, type HubItem } from "@/components/company/hub-list";
import { EmptyState } from "@/components/list";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { userHasPermission } from "@/lib/company/permissions";
import { tierAtLeast } from "@rothern/shared";
import { BarChart3, Eye, FileText, GitCompare, TrendingUp } from "lucide-react";

/**
 * HUB KARTLARI YETKİYE GÖRE (2026-09-17), PAKET KİLİDİ ROLÜN İÇİNDE
 * (arayüz testi O-043): İş Analizi satış tarafı (Silver+, insights:view);
 * üç satınalma raporu Gold + buy:reports:view.
 *  · izin yok            → kart HİÇ çizilmez ("görmemesi gereken kartı görmesin")
 *  · izin var, paket yok → kilitli kart (rozet; tıklayınca raporun paket kapısı)
 *  · hiç kart yoksa      → boş durum (eskiden başlığın altı bomboştu)
 * Kapılar alt düzenlerde de var (adresle girilirse).
 */
export default function SatinalmaRaporlarPage() {
  const t = useTranslations("web.panel.reports.sirketimRaporlarPage");
  const { user, company } = useCompanyAuth();
  const tier = company?.tier ?? "STANDART";
  const hasInsightsPerm = userHasPermission(user, "insights:view");
  const hasPurchasingPerm = userHasPermission(user, "buy:reports:view");
  const insightsOpen = tierAtLeast(tier, "SILVER");
  const purchasingOpen = tierAtLeast(tier, "GOLD");

  const items: HubItem[] = [];
  if (hasInsightsPerm) {
    // İş Analizi (2026-09-05, Europages "Business Insights"): görünürlük,
    // ziyaretçi, alıcı bağlantıları, teklif/kazanma — Silver+.
    items.push({
      href: "/company/sirketim/raporlar/is-analizi",
      label: t("isAnalizi"),
      description: t("profilVeUrunGoruntulenmeleriKimligi"),
      icon: Eye,
      lockedLabel: insightsOpen ? undefined : t("silverIleAcilir"),
    });
  }
  if (hasPurchasingPerm) {
    if (purchasingOpen) {
      items.push(
        {
          href: "/company/sirketim/raporlar/genel",
          label: t("genelSatinAlmaTalebiRaporu"),
          description: t("tekSatinAlmaTalebiVeya"),
          icon: FileText,
        },
        {
          href: "/company/sirketim/raporlar/tasarruf",
          label: t("tasarrufRaporu"),
          description: t("rekabetinSizeKazandirdiginiGorunHedef"),
          icon: TrendingUp,
        },
        {
          href: "/company/sirketim/raporlar/teklif-karsilastirma",
          label: t("teklifKarsilastirmaRaporu"),
          description: t("birSatinAlmaTalebineGelen"),
          icon: GitCompare,
        },
      );
    } else {
      // Paket yetmiyorsa üç rapor TEK kilitli kart: hedef sayfa Gold paket
      // kapısını (vurgulu Gold kartı) açar.
      items.push({
        href: "/company/sirketim/raporlar/genel",
        label: t("satinalmaRaporlari"),
        description: t("satinalmaRaporlariKilitliAciklama"),
        icon: BarChart3,
        lockedLabel: t("goldIleAcilir"),
      });
    }
  }

  return (
    <div className="space-y-8">
      {/* Özet grafikler ve zaman tasarrufu şeridi Şirketim › Genel Bakış'ta
          (2026-09-05) — hub yalnız rapor listesi. */}
      <HubList
        title={t("raporlar")}
        description={t("isAnaliziIleGorunurlugunuzuIzleyin")}
        items={items}
        empty={
          <EmptyState
            icon={BarChart3}
            title={t("sizeAcikRaporYok")}
            description={t("raporlarYetkiyleAcilir")}
          />
        }
      />
    </div>
  );
}
