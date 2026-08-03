"use client";

import { HubList } from "@/components/company/hub-list";
import { WinRateCard } from "@/components/dashboard/win-rate-card";
import dynamic from "next/dynamic";
import { FileText, GitCompare, TrendingUp } from "lucide-react";

// Grafikler (recharts) rota paketine girmesin — tembel + yalnız istemci.
const ReportsSummaryCharts = dynamic(
  () =>
    import("@/components/reports/reports-summary-charts").then(
      (m) => m.ReportsSummaryCharts,
    ),
  { ssr: false },
);

export default function SatisRaporlarPage() {
  return (
    <div className="space-y-8">
    <HubList
      title="Raporlar"
      description="Bir rapor tipi seçin, kriterleri doldurun; sonucu web'de görüntüleyin ya da Excel olarak indirin."
      items={[
        {
          href: "/company/satis/raporlar/genel",
          label: "Genel İlan Raporu",
          description:
            "Tek ilan veya tarih aralığında satış ilanlarınızı listeleyin — katılım, kazanan ve kazançla.",
          icon: FileText,
        },
        {
          href: "/company/satis/raporlar/kazanc",
          label: "Rekabet Kazancı Raporu",
          description:
            "Rekabetin fiyatı ne kadar yükselttiğini görün — tabana göre kalem bazlı detayla.",
          icon: TrendingUp,
        },
        {
          href: "/company/satis/raporlar/teklif-karsilastirma",
          label: "Teklif Karşılaştırma Raporu",
          description:
            "Bir ilana gelen alıcı tekliflerini kalem bazında yan yana karşılaştırın.",
          icon: GitCompare,
        },
      ]}
    />
      {/* Pano refactor Faz 1: kazanma-oranı şeridi anasayfadan buraya taşındı
          (n<10 karar iken oran gösterilmez). */}
      <WinRateCard />
      {/* P2 (denetim §10.5): hub özet grafikleri. */}
      <ReportsSummaryCharts type="SATIS" />
    </div>
  );
}
