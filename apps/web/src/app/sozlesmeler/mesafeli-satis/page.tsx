import { LegalDoc } from "@/components/marketing/legal-doc";
import { OPERATOR } from "@/lib/company-info";

export const metadata = { title: "Mesafeli Satış Sözleşmesi — Rothern" };

export default function Page() {
  return (
    <LegalDoc
      title="Mesafeli Satış Sözleşmesi ve Ön Bilgilendirme"
      updatedAt="26 Temmuz 2026"
      sections={[
        {
          heading: "1. Satıcı Bilgileri",
          list: [
            `Ticari unvan: ${OPERATOR.legalName} ("Satıcı")`,
            `Marka / hizmet: ${OPERATOR.brand} — ${OPERATOR.website}`,
            `Adres: ${OPERATOR.address}`,
            `Vergi dairesi / no: ${OPERATOR.taxOffice} / ${OPERATOR.taxNo}`,
            `E-posta: ${OPERATOR.supportEmail}`,
          ],
        },
        {
          heading: "2. Konu ve Hizmetin Tanımı",
          paragraphs: [
            "İşbu Sözleşme'nin konusu; Alıcı'nın (üyelik paketini satın alan firma), Satıcı'ya ait Rothern B2B e-tedarik ve e-satın alma talebi platformu üzerinde sunulan dijital üyelik paketlerinden (Silver, Gold) birini elektronik ortamda satın almasına ilişkin tarafların hak ve yükümlülükleridir.",
            "Paketlerin kapsamı, dönem seçenekleri (6 aylık veya 1 yıllık) ve güncel fiyatları platformda ilan edilir; satın alma anında seçilen paket, dönem ve toplam bedel ödeme sayfasında ayrıca gösterilir.",
          ],
        },
        {
          heading: "3. Ticari Nitelik",
          paragraphs: [
            "Platform münhasıran işletmeler arası (B2B) kullanım içindir; Alıcı, satın almayı ticari veya mesleki faaliyeti kapsamında yaptığını ve 6502 sayılı Kanun anlamında tüketici sıfatı taşımadığını kabul eder. Bu nedenle tüketici işlemlerine özgü cayma hakkı hükümleri uygulanmaz; iptal ve iade koşulları işbu Sözleşme'nin 6. maddesinde ve İptal ve İade Koşulları sayfasında düzenlenir.",
          ],
        },
        {
          heading: "4. Fiyat ve Ödeme",
          paragraphs: [
            "Paket fiyatları USD cinsinden ilan edilir ve KDV hariçtir; tahsil edilecek nihai tutar, varsa vergiler dâhil olmak üzere ödeme sayfasında gösterilir. Ödeme, 6 aylık veya 1 yıllık dönem bedelinin tamamı için peşin olarak, ödeme kuruluşunun güvenli altyapısı üzerinden kredi/banka kartı ile alınır; aylık faturalama yoktur.",
            "Satıcı, kart bilgilerini saklamaz; ödeme işlemleri ödeme kuruluşunun güvenli sayfasında gerçekleşir. Ödemeye ilişkin fatura, Alıcı'nın bildirdiği firma bilgileriyle elektronik ortamda düzenlenir.",
          ],
        },
        {
          heading: "5. İfa — Hizmetin Aktivasyonu",
          paragraphs: [
            "Üyelik paketi, ödemenin onaylanmasıyla birlikte gecikmeksizin Alıcı'nın firma hesabında aktive edilir ve dönem süresi bu tarihte başlar. Hizmet dijital olarak sunulur; fiziksel teslimat yoktur.",
            "Dönem sonunda üyelik otomatik yenilenmez; Alıcı dilerse yeni dönem satın alır. Dönem içinde üst pakete geçiş koşulları platformda ilan edilir.",
          ],
        },
        {
          heading: "6. İptal ve İade",
          paragraphs: [
            "Ödeme alınmış ancak paket henüz aktive edilmemişse Alıcı bedelin tamamının iadesini talep edebilir. Paketin aktive edilmesiyle hizmet ifasına başlanmış sayılır; aktive edilmiş dönem bedeli, Satıcı'dan kaynaklanan sürekli ve esaslı bir ifa imkânsızlığı bulunmadıkça iade edilmez.",
            "Mükerrer veya hatalı tahsilatlar, Alıcı'nın bildirimi üzerine incelenerek en geç 14 gün içinde aynı ödeme aracına iade edilir. Ayrıntılar İptal ve İade Koşulları sayfasındadır.",
          ],
        },
        {
          heading: "7. Genel Hükümler",
          paragraphs: [
            "İşbu Sözleşme'de düzenlenmeyen hususlarda Kullanıcı Sözleşmesi ile Platform Aracılık ve Kullanım Sözleşmesi hükümleri uygulanır. Sözleşme, sipariş onayıyla elektronik ortamda kurulur ve satın alınan dönemin sonuna kadar yürürlükte kalır.",
            `Uyuşmazlıklarda Satıcı'nın ticari kayıtları ile platform kayıtları delil teşkil eder; Türk hukuku uygulanır ve ${OPERATOR.jurisdiction} yetkilidir.`,
          ],
        },
      ]}
    />
  );
}
