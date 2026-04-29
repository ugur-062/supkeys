import { PlaceholderPage } from "@/components/dashboard/placeholder-page";
import { CheckSquare } from "lucide-react";

export const metadata = {
  title: "Onay Bekleyenler — Supkeys",
};

export default function OnayBekleyenlerPage() {
  return (
    <PlaceholderPage
      title="Onay Bekleyenler"
      subtitle="Sizin onayınızı bekleyen ihale, sipariş ve tedarikçi başvuruları burada listelenecek."
      description="Tek tıkla onaylayabilir, gerekirse geri yollayabilirsiniz. Onay zincirleri rol ve harcama limitine göre konfigüre edilebilir."
      icon={CheckSquare}
      estimatedRelease="V2"
      highlights={[
        "Çok aşamalı onay akışları",
        "Mobil onay bildirimleri",
        "Onay yetki seviyeleri",
      ]}
    />
  );
}
