"use client";

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
  const { user, company } = useCompanyAuth();
  const tier = company?.tier ?? "STANDART";
  const canInsights = userHasPermission(user, "insights:view") && tierAtLeast(tier, "SILVER");
  const canPurchasing = userHasPermission(user, "buy:reports:view") && tierAtLeast(tier, "GOLD");
  return (
    <div className="space-y-8">
      {/* Özet grafikler ve zaman tasarrufu şeridi Şirketim › Genel Bakış'ta
          (2026-09-05) — hub yalnız rapor listesi. */}
    <HubList
      title="Raporlar"
      description="İş Analizi ile görünürlüğünüzü izleyin; satın alma raporlarında kriterleri doldurup sonucu web'de görün ya da Excel olarak indirin."
      items={[
        ...(canInsights ? [{
          // İş Analizi (2026-09-05, Europages "Business Insights"): görünürlük,
          // ziyaretçi, alıcı bağlantıları, teklif/kazanma — Silver+.
          href: "/company/sirketim/raporlar/is-analizi",
          label: "İş Analizi",
          description:
            "Profil ve ürün görüntülenmeleri, kimliği bilinen ziyaretçiler, bilgi talepleri ve yanıt süresi, davetler, teklif ve kazanma oranı.",
          icon: Eye,
        }] : []),
        ...(canPurchasing ? [{
          href: "/company/sirketim/raporlar/genel",
          label: "Genel Satın Alma Talebi Raporu",
          description:
            "Tek satın alma talebi veya tarih aralığında satın alma taleplerinizi listeleyin — katılım, kazanan ve tasarrufla.",
          icon: FileText,
        },
        {
          href: "/company/sirketim/raporlar/tasarruf",
          label: "Tasarruf Raporu",
          description:
            "Rekabetin size kazandırdığını görün — hedef fiyata göre kalem bazlı detayla.",
          icon: TrendingUp,
        },
        {
          href: "/company/sirketim/raporlar/teklif-karsilastirma",
          label: "Teklif Karşılaştırma Raporu",
          description:
            "Bir satın alma talebine gelen teklifleri kalem bazında yan yana karşılaştırın.",
          icon: GitCompare,
        }] : []),
      ]}
    />
    </div>
  );
}
