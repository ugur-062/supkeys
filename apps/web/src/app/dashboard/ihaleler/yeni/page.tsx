import { PlaceholderPage } from "@/components/dashboard/placeholder-page";
import { Plus } from "lucide-react";

export const metadata = {
  title: "Yeni İhale — Supkeys",
};

export default function YeniIhalePage() {
  return (
    <PlaceholderPage
      title="Yeni İhale Oluştur"
      subtitle="Adım adım ihale oluşturma sihirbazı yakında burada olacak."
      description="Talep detayları, kalem listesi, davet edilecek tedarikçiler ve eksiltme parametrelerini tek akışta tanımlayabileceksin."
      icon={Plus}
      estimatedRelease="V2"
      highlights={[
        "Çok kalemli ihale oluşturma",
        "Tedarikçi davet listesi",
        "Açık/kapalı eksiltme parametreleri",
      ]}
    />
  );
}
