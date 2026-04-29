import { PlaceholderPage } from "@/components/dashboard/placeholder-page";
import { Users } from "lucide-react";

export const metadata = {
  title: "Tedarikçiler — Supkeys",
};

export default function TedarikcilerPage() {
  return (
    <PlaceholderPage
      title="Tedarikçiler"
      subtitle="Onaylı tedarikçi listenizi yönetin, yeni tedarikçileri davet edin."
      description="45 binlik Supkeys tedarikçi havuzundan kategoriye göre keşfedin, kendi listenize ekleyin, performansını izleyin."
      icon={Users}
      estimatedRelease="V2"
      highlights={[
        "Tedarikçi keşfi ve davet",
        "Kategori bazlı filtreleme",
        "Performans skoru ve değerlendirme",
      ]}
    />
  );
}
