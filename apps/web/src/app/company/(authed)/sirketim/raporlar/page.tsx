"use client";

import { HubList } from "@/components/company/hub-list";
import { SatinalmaAnalytics } from "@/components/reports/satinalma-analytics";
import { TimeSavingsStrip } from "@/components/dashboard/time-savings-strip";
import dynamic from "next/dynamic";
import { Eye, FileText, GitCompare, TrendingUp } from "lucide-react";

// Grafikler (recharts) rota paketine girmesin — tembel + yalnız istemci.
const ReportsSummaryCharts = dynamic(
  () =>
    import("@/components/reports/reports-summary-charts").then(
      (m) => m.ReportsSummaryCharts,
    ),
  { ssr: false },
);

export default function SatinalmaRaporlarPage() {
  return (
    <div className="space-y-8">
    <HubList
      title="Raporlar"
      description="İş Analizi ile görünürlüğünüzü izleyin; satın alma raporlarında kriterleri doldurup sonucu web'de görün ya da Excel olarak indirin."
      items={[
        {
          // İş Analizi (2026-09-05, Europages "Business Insights"): görünürlük,
          // ziyaretçi, alıcı bağlantıları, teklif/kazanma — Silver+.
          href: "/company/sirketim/raporlar/is-analizi",
          label: "İş Analizi",
          description:
            "Profil ve ürün görüntülenmeleri, kimliği bilinen ziyaretçiler, bilgi talepleri ve yanıt süresi, davetler, teklif ve kazanma oranı.",
          icon: Eye,
        },
        {
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
        },
      ]}
    />
      {/* Pano refactor Faz 1: zaman-tasarrufu şeridi anasayfadan buraya taşındı. */}
      <TimeSavingsStrip />
      {/* P2 (denetim §10.5): hub özet grafikleri. */}
      {/* Panodan taşınan analiz — hub listesinin ALTINDA: rapor seçmek
          birincil iş, analiz ikincil. */}
      <SatinalmaAnalytics />
      <ReportsSummaryCharts type="ALIM" />
    </div>
  );
}
