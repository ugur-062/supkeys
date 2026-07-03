"use client";

import { HubList } from "@/components/company/hub-list";
import { FileText, GitCompare, TrendingUp } from "lucide-react";

export default function SatinalmaRaporlarPage() {
  return (
    <HubList
      title="Raporlar"
      description="Bir rapor tipi seçin, kriterleri doldurun; sonucu web'de görüntüleyin ya da Excel olarak indirin."
      items={[
        {
          href: "/company/satinalma/raporlar/genel",
          label: "Genel İhale Raporu",
          description:
            "Tek ihale veya tarih aralığında ihalelerinizi listeleyin — katılım, kazanan ve tasarrufla.",
          icon: FileText,
        },
        {
          href: "/company/satinalma/raporlar/tasarruf",
          label: "Tasarruf Raporu",
          description:
            "Rekabetin size kazandırdığını görün — hedef fiyata göre kalem bazlı detayla.",
          icon: TrendingUp,
        },
        {
          href: "/company/satinalma/raporlar/teklif-karsilastirma",
          label: "Teklif Karşılaştırma Raporu",
          description:
            "Bir ihaleye gelen teklifleri kalem bazında yan yana karşılaştırın.",
          icon: GitCompare,
        },
      ]}
    />
  );
}
