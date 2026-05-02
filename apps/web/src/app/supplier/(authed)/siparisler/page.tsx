import { PlaceholderPage } from "@/components/dashboard/placeholder-page";
import { Package } from "lucide-react";

export const metadata = {
  title: "Siparişler",
};

export default function SupplierSiparislerPage() {
  return (
    <PlaceholderPage
      icon={Package}
      title="Siparişler"
      subtitle="Kazandığınız ihalelerden oluşan siparişler burada listelenecek."
      description="Sipariş durumunu güncelleyin, sevk planlayın, teslim sonrası alıcı onayını takip edin."
      highlights={[
        "Sipariş durum güncelleme (hazırlanıyor / kargoda / teslim edildi)",
        "Sevk dokümanları yükleme",
        "Alıcı ile mesajlaşma",
        "Fatura ve ödeme takibi",
      ]}
      backHref="/supplier/dashboard"
      backLabel="Ana sayfaya dön"
    />
  );
}
