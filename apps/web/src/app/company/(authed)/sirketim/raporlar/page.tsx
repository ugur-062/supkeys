"use client";

import { HubList } from "@/components/company/hub-list";
import { Eye, FileText, GitCompare, TrendingUp } from "lucide-react";

export default function SatinalmaRaporlarPage() {
  return (
    <div className="space-y-8">
      {/* Özet grafikler ve zaman tasarrufu şeridi Şirketim › Genel Bakış'ta
          (2026-09-05) — hub yalnız rapor listesi. */}
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
    </div>
  );
}
