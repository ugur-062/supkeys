"use client";

import { useTranslations } from "next-intl";
import { HubList } from "@/components/company/hub-list";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { userHasPermission } from "@/lib/company/permissions";
import { tierAtLeast } from "@rothern/shared";
import { Eye, FileText, GitCompare, TrendingUp } from "lucide-react";

/**
 * HUB YALNIZ YETKİLİ KARTLARI ÇİZER (2026-09-17). İş Analizi satış tarafı
 * (Silver+, insights:view); üç satınalma raporu Gold + buy:reports:view.
 * Kapılar alt düzenlerde de var (adresle girilirse) — burası tekrar değil,
 * "görmemesi gereken kartı hiç görmesin" kuralı.
 */
export default function SatinalmaRaporlarPage() {
  const t = useTranslations("web.panel.reports.sirketimRaporlarPage");
  const { user, company } = useCompanyAuth();
  const tier = company?.tier ?? "STANDART";
  const canInsights = userHasPermission(user, "insights:view") && tierAtLeast(tier, "SILVER");
  const canPurchasing = userHasPermission(user, "buy:reports:view") && tierAtLeast(tier, "GOLD");
  return (
    <div className="space-y-8">
      {/* Özet grafikler ve zaman tasarrufu şeridi Şirketim › Genel Bakış'ta
          (2026-09-05) — hub yalnız rapor listesi. */}
    <HubList
      title={t("raporlar")}
      description={t("isAnaliziIleGorunurlugunuzuIzleyin")}
      items={[
        ...(canInsights ? [{
          // İş Analizi (2026-09-05, Europages "Business Insights"): görünürlük,
          // ziyaretçi, alıcı bağlantıları, teklif/kazanma — Silver+.
          href: "/company/sirketim/raporlar/is-analizi",
          label: t("isAnalizi"),
          description:
            t("profilVeUrunGoruntulenmeleriKimligi"),
          icon: Eye,
        }] : []),
        ...(canPurchasing ? [{
          href: "/company/sirketim/raporlar/genel",
          label: t("genelSatinAlmaTalebiRaporu"),
          description:
            t("tekSatinAlmaTalebiVeya"),
          icon: FileText,
        },
        {
          href: "/company/sirketim/raporlar/tasarruf",
          label: t("tasarrufRaporu"),
          description:
            t("rekabetinSizeKazandirdiginiGorunHedef"),
          icon: TrendingUp,
        },
        {
          href: "/company/sirketim/raporlar/teklif-karsilastirma",
          label: t("teklifKarsilastirmaRaporu"),
          description:
            t("birSatinAlmaTalebineGelen"),
          icon: GitCompare,
        }] : []),
      ]}
    />
    </div>
  );
}
