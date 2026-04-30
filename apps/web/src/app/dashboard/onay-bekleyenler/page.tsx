import { PlaceholderPage } from "@/components/dashboard/placeholder-page";

export const metadata = {
  title: "Onay Bekleyenler — Supkeys",
};

export default function OnayBekleyenlerPage() {
  return (
    <PlaceholderPage
      iconKey="onay-bekleyenler"
      title="Onay Bekleyenler"
      subtitle="Sizin onayınızı bekleyen ihale, sipariş ve tedarikçi başvuruları burada listelenecek."
      description="Tek tıkla onaylayabilir, gerekirse geri yollayabilirsiniz. Onay zincirleri rol ve harcama limitine göre konfigüre edilebilir."
      estimatedRelease="V2"
      highlights={[
        "Çok aşamalı onay akışları",
        "Mobil onay bildirimleri",
        "Onay yetki seviyeleri",
      ]}
    />
  );
}
