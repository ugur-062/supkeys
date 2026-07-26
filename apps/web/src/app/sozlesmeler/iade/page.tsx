import { LegalDoc } from "@/components/marketing/legal-doc";
import { OPERATOR } from "@/lib/company-info";

export const metadata = { title: "İptal ve İade Koşulları — Rothern" };

export default function Page() {
  return (
    <LegalDoc
      title="İptal ve İade Koşulları"
      updatedAt="26 Temmuz 2026"
      sections={[
        {
          paragraphs: [
            `Bu sayfa, ${OPERATOR.legalName} tarafından işletilen Rothern platformunda satılan dijital üyelik paketlerine (Bronz, Silver, Gold — 6 aylık veya 1 yıllık dönem) ilişkin iptal ve iade koşullarını düzenler. Platform B2B niteliktedir; satın alma ticari faaliyet kapsamında yapılır ve tüketici mevzuatındaki cayma hakkı hükümleri uygulanmaz.`,
          ],
        },
        {
          heading: "1. Aktivasyon Öncesi İptal",
          paragraphs: [
            "Ödemesi alınmış ancak üyelik paketi hesabınızda henüz aktive edilmemişse, talebiniz üzerine bedelin tamamı kesintisiz iade edilir.",
          ],
        },
        {
          heading: "2. Aktivasyon Sonrası",
          paragraphs: [
            "Paket, ödemenin onaylanmasıyla hesabınızda derhâl aktive edilir ve hizmet ifası başlar. Aktive edilmiş dönem bedeli; platformdan kaynaklanan sürekli ve esaslı bir hizmet verilememe durumu bulunmadıkça iade edilmez. Dönem sonunda otomatik yenileme yoktur — yeni dönem ancak sizin satın almanızla başlar.",
          ],
        },
        {
          heading: "3. Mükerrer ve Hatalı Tahsilat",
          paragraphs: [
            "Aynı dönem için birden fazla tahsilat yapılması veya tutarın hatalı tahsil edilmesi hâlinde, bildiriminiz üzerine inceleme yapılır ve fazla tutar en geç 14 gün içinde ödemenin yapıldığı karta iade edilir.",
          ],
        },
        {
          heading: "4. Hesabın Askıya Alınması veya Feshi",
          paragraphs: [
            "Kullanıcı Sözleşmesi'ne veya Aracılık Sözleşmesi'ne aykırılık nedeniyle hesabın askıya alınması ya da üyeliğin feshi hâlinde, kalan dönem bedeli iade edilmez. Hesabınızı kendi talebinizle kapatmanız da kalan döneme ilişkin iade hakkı doğurmaz.",
          ],
        },
        {
          heading: "5. Başvuru",
          paragraphs: [
            `İptal ve iade talepleriniz için firma hesabınıza kayıtlı e-posta adresinizden ${OPERATOR.supportEmail} adresine, firma unvanınız ve işlem bilgileriyle birlikte başvurabilirsiniz. Talepler en geç 14 gün içinde sonuçlandırılır.`,
          ],
        },
      ]}
    />
  );
}
