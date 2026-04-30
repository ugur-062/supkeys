import { PlaceholderPage } from "@/components/dashboard/placeholder-page";

export const metadata = {
  title: "İhaleler — Supkeys",
};

export default function IhalelerPage() {
  return (
    <PlaceholderPage
      iconKey="ihaleler"
      title="İhaleler"
      subtitle="İhalelerinizi bu sayfadan yönetin: oluşturun, takip edin, sonuçlandırın."
      description="Açık eksiltme, kapalı zarf ve hibrit ihale tiplerini destekleyeceğiz. Tedarikçilerinizi davet edin, teklifleri karşılaştırın, tasarrufunuzu raporlayın."
      estimatedRelease="V2"
      highlights={[
        "İhale oluşturma ve düzenleme",
        "Açık ve kapalı eksiltme modları",
        "Teklif karşılaştırma ve kazandırma",
      ]}
    />
  );
}
