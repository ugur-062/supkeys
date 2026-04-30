import { PlaceholderPage } from "@/components/dashboard/placeholder-page";

export const metadata = {
  title: "Tedarikçiler — Supkeys",
};

export default function TedarikcilerPage() {
  return (
    <PlaceholderPage
      iconKey="tedarikciler"
      title="Tedarikçiler"
      subtitle="Onaylı tedarikçi listenizi yönetin, yeni tedarikçileri davet edin."
      description="45 binlik Supkeys tedarikçi havuzundan kategoriye göre keşfedin, kendi listenize ekleyin, performansını izleyin."
      estimatedRelease="V2"
      highlights={[
        "Tedarikçi keşfi ve davet",
        "Kategori bazlı filtreleme",
        "Performans skoru ve değerlendirme",
      ]}
    />
  );
}
