import { PlaceholderPage } from "@/components/dashboard/placeholder-page";

export const metadata = {
  title: "Yeni İhale — Supkeys",
};

export default function YeniIhalePage() {
  return (
    <PlaceholderPage
      iconKey="ihaleler-yeni"
      title="Yeni İhale Oluştur"
      subtitle="Adım adım ihale oluşturma sihirbazı yakında burada olacak."
      description="Talep detayları, kalem listesi, davet edilecek tedarikçiler ve eksiltme parametrelerini tek akışta tanımlayabileceksin."
      estimatedRelease="V2"
      highlights={[
        "Çok kalemli ihale oluşturma",
        "Tedarikçi davet listesi",
        "Açık/kapalı eksiltme parametreleri",
      ]}
    />
  );
}
