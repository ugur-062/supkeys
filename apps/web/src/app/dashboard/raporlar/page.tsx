import { PlaceholderPage } from "@/components/dashboard/placeholder-page";

export const metadata = {
  title: "Raporlar — Supkeys",
};

export default function RaporlarPage() {
  return (
    <PlaceholderPage
      iconKey="raporlar"
      title="Raporlar"
      subtitle="Satın alma performansınızı, tasarruf trendlerinizi ve kategori bazlı detayları görüntüleyin."
      description="Yöneticiye özet, satın alma ekibine detay, finansa harcama bazlı raporlar — hepsini tek yerden alın."
      estimatedRelease="V2"
      highlights={[
        "Tasarruf ve harcama dashboard'ı",
        "Kategori ve tedarikçi kırılımı",
        "Excel/CSV dışa aktarma",
      ]}
    />
  );
}
