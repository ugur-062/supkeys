"use client";

import { HubList } from "@/components/company/hub-list";
import { FileText, GitCompare, TrendingUp } from "lucide-react";

export default function SatisRaporlarPage() {
  return (
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
  );
}
