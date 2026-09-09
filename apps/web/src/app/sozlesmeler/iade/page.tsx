import { LegalDoc } from "@/components/marketing/legal-doc";
import { buildMetadata } from "@/lib/seo/meta";
import { OPERATOR } from "@/lib/company-info";

/* "— Rothern" YOK: kök şablon (`%s · Rothern`) markayı ekliyor; elle
   eklenince "… — Rothern · Rothern" çıkıyordu (SEO Parça 7). */
export const metadata = buildMetadata({
  title: "Teslimat, İptal ve İade Koşulları",
  description:
    "Rothern üyelik paketlerinde teslimat, iptal ve iade koşulları; cayma hakkı ve geri ödeme süreci.",
  path: "/sozlesmeler/iade",
});

export default function Page() {
  return (
    <LegalDoc
      title="Teslimat, İptal ve İade Koşulları"
      updatedAt="26 Temmuz 2026"
      sections={[
        {
          paragraphs: [
            `Bu sayfa, ${OPERATOR.legalName} tarafından işletilen Rothern platformunda satılan dijital üyelik paketlerine (Silver, Gold — 6 aylık veya 1 yıllık dönem) ilişkin iptal ve iade koşullarını düzenler. Platform B2B niteliktedir; satın alma ticari faaliyet kapsamında yapılır ve tüketici mevzuatındaki cayma hakkı hükümleri uygulanmaz.`,
          ],
        },
        {
          heading: "1. Teslimat (Dijital Hizmet)",
          paragraphs: [
            "Satın alınan üyelik paketi dijital bir hizmettir; fiziksel kargo/teslimat yoktur. Paket, ödemenin onaylanmasıyla birlikte firma hesabınızda OTOMATİK ve DERHÂL aktive edilir — dönem süresi bu anda başlar ve tüm paket özellikleri anında kullanıma açılır.",
          ],
        },
        {
          heading: "2. Aktivasyon Öncesi İptal",
          paragraphs: [
            "Ödemesi alınmış ancak üyelik paketi hesabınızda henüz aktive edilmemişse, talebiniz üzerine bedelin tamamı kesintisiz iade edilir.",
          ],
        },
        {
          heading: "3. Aktivasyon Sonrası",
          paragraphs: [
            "Paket, ödemenin onaylanmasıyla hesabınızda derhâl aktive edilir ve hizmet ifası başlar. Aktive edilmiş dönem bedeli; platformdan kaynaklanan sürekli ve esaslı bir hizmet verilememe durumu bulunmadıkça iade edilmez. Dönem sonunda otomatik yenileme yoktur — yeni dönem ancak sizin satın almanızla başlar.",
          ],
        },
        {
          heading: "4. Mükerrer ve Hatalı Tahsilat",
          paragraphs: [
            "Aynı dönem için birden fazla tahsilat yapılması veya tutarın hatalı tahsil edilmesi hâlinde, bildiriminiz üzerine inceleme yapılır ve fazla tutar en geç 14 gün içinde ödemenin yapıldığı karta iade edilir.",
          ],
        },
        {
          heading: "5. Hesabın Askıya Alınması veya Feshi",
          paragraphs: [
            "Kullanıcı Sözleşmesi'ne veya Aracılık Sözleşmesi'ne aykırılık nedeniyle hesabın askıya alınması ya da üyeliğin feshi hâlinde, kalan dönem bedeli iade edilmez. Hesabınızı kendi talebinizle kapatmanız da kalan döneme ilişkin iade hakkı doğurmaz.",
          ],
        },
        {
          heading: "6. Başvuru",
          paragraphs: [
            `İptal ve iade talepleriniz için firma hesabınıza kayıtlı e-posta adresinizden ${OPERATOR.supportEmail} adresine, firma unvanınız ve işlem bilgileriyle birlikte başvurabilirsiniz. Talepler en geç 14 gün içinde sonuçlandırılır.`,
          ],
        },
      ]}
    />
  );
}
