import { PlaceholderPage } from "@/components/dashboard/placeholder-page";

export const metadata = {
  title: "Teklifler — Supkeys",
};

export default function TekliflerPage() {
  return (
    <PlaceholderPage
      iconKey="teklifler"
      title="Teklifler"
      subtitle="Tedarikçilerden gelen teklifleri buradan yönetin."
      description="Aktif ihalelerinize gelen tüm teklifleri tek panelde inceleyin, karşılaştırın, kazandırma kararını verin."
      estimatedRelease="V2"
      highlights={[
        "İhale bazlı teklif listesi",
        "Yan yana fiyat ve süre karşılaştırma",
        "Kazandırma ve revize talepleri",
      ]}
    />
  );
}
