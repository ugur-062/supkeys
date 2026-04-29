import { PlaceholderPage } from "@/components/dashboard/placeholder-page";
import { BarChart3 } from "lucide-react";

export const metadata = {
  title: "Raporlar — Supkeys",
};

export default function RaporlarPage() {
  return (
    <PlaceholderPage
      title="Raporlar"
      subtitle="Satın alma performansınızı, tasarruf trendlerinizi ve kategori bazlı detayları görüntüleyin."
      description="Yöneticiye özet, satın alma ekibine detay, finansa harcama bazlı raporlar — hepsini tek yerden alın."
      icon={BarChart3}
      estimatedRelease="V2"
      highlights={[
        "Tasarruf ve harcama dashboard'ı",
        "Kategori ve tedarikçi kırılımı",
        "Excel/CSV dışa aktarma",
      ]}
    />
  );
}
