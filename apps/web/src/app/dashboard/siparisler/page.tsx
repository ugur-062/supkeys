import { PlaceholderPage } from "@/components/dashboard/placeholder-page";

export const metadata = {
  title: "Siparişler — Supkeys",
};

export default function SiparislerPage() {
  return (
    <PlaceholderPage
      iconKey="siparisler"
      title="Siparişler"
      subtitle="İhaleden çıkan veya manuel açılan siparişlerinizi tek yerden takip edin."
      description="Sipariş onayı, kabul, irsaliye ve fatura eşleştirmesi tek panelden yönetilebilecek."
      estimatedRelease="V2"
      highlights={[
        "Sipariş onayı ve gönderim takibi",
        "İrsaliye/fatura eşleştirmesi",
        "Tedarikçi performans skoru",
      ]}
    />
  );
}
