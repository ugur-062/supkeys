import { getTranslations, setRequestLocale } from "next-intl/server";
import { localeFromParams, type LocaleParams } from "@/i18n/params";
import type { Metadata } from "next";
import { LegalDoc } from "@/components/marketing/legal-doc";
import { LEGAL_DOC_LOCALES, buildMetadata } from "@/lib/seo/meta";
import { OPERATOR } from "@/lib/company-info";

/* "— Rothern" YOK: kök şablon (`%s · Rothern`) markayı ekliyor; elle
   eklenince "… — Rothern · Rothern" çıkıyordu (SEO Parça 7). */
export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const locale = await localeFromParams(params);
  const t = await getTranslations({ locale, namespace: "web.marketing.legal.mesafeli" });
  return buildMetadata({
    locale,
    // Hukuki metin yalnız Türkçe: EN/RU sayfanın kanoniği Türkçe adres.
    locales: LEGAL_DOC_LOCALES,
    title: t("metaTitle"),
    description: t("metaDesc"),
    path: "/sozlesmeler/mesafeli-satis",
  });
}

export default async function Page({ params }: { params: LocaleParams }) {
  setRequestLocale(await localeFromParams(params));
  return (
    <LegalDoc
      path="/sozlesmeler/mesafeli-satis"
      title="Mesafeli Satış Sözleşmesi ve Ön Bilgilendirme"
      updatedAt="2026-10-07"
      sections={[
        {
          heading: "1. Satıcı Bilgileri",
          list: [
            `Ticari unvan: ${OPERATOR.legalName} ("Satıcı")`,
            `Marka / hizmet: ${OPERATOR.brand} — ${OPERATOR.website}`,
            `Adres: ${OPERATOR.address}`,
            `MERSİS no: ${OPERATOR.mersisNo}`,
            `Vergi dairesi / no: ${OPERATOR.taxOffice} / ${OPERATOR.taxNo}`,
            `E-posta: ${OPERATOR.supportEmail}`,
          ],
        },
        {
          heading: "2. Konu ve Hizmetin Tanımı",
          paragraphs: [
            "Rothern platformunun kullanımı şu anda ücretsizdir; ücretli hizmetler ileride önceden duyurularak sunulabilir. İşbu Sözleşme'nin konusu; Alıcı'nın (ücretli hizmeti satın alan firma), Satıcı'ya ait Rothern B2B e-tedarik ve e-satın alma talebi platformu üzerinde sunulabilecek ücretli dijital hizmetlerden birini elektronik ortamda satın almasına ilişkin tarafların hak ve yükümlülükleridir.",
            "Ücretli hizmetlerin kapsamı, dönem seçenekleri ve güncel bedelleri, sunulduklarında platformda ilan edilir; satın alma anında seçilen hizmet, dönem ve toplam bedel ödeme sayfasında ayrıca gösterilir.",
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
            "Ücretli hizmetlerin bedelleri platformda ilan edilir ve KDV hariçtir; tahsil edilecek nihai tutar, varsa vergiler dâhil olmak üzere ödeme sayfasında gösterilir. Ödeme, seçilen dönem bedelinin tamamı için peşin olarak, ödeme kuruluşunun güvenli altyapısı üzerinden kredi/banka kartı ile alınır.",
            "Satıcı, kart bilgilerini saklamaz; ödeme işlemleri ödeme kuruluşunun güvenli sayfasında gerçekleşir. Ödemeye ilişkin fatura, Alıcı'nın bildirdiği firma bilgileriyle elektronik ortamda düzenlenir.",
          ],
        },
        {
          heading: "5. İfa — Hizmetin Aktivasyonu",
          paragraphs: [
            "Ücretli hizmet, ödemenin onaylanmasıyla birlikte gecikmeksizin Alıcı'nın firma hesabında aktive edilir ve dönem süresi bu tarihte başlar. Hizmet dijital olarak sunulur; fiziksel teslimat yoktur.",
            "Dönem sonunda ücretli hizmet otomatik yenilenmez; Alıcı dilerse yeni dönem satın alır.",
          ],
        },
        {
          heading: "6. İptal ve İade",
          paragraphs: [
            "Ödeme alınmış ancak ücretli hizmet henüz aktive edilmemişse Alıcı bedelin tamamının iadesini talep edebilir. Hizmetin aktive edilmesiyle hizmet ifasına başlanmış sayılır; aktive edilmiş dönem bedeli, Satıcı'dan kaynaklanan sürekli ve esaslı bir ifa imkânsızlığı bulunmadıkça iade edilmez.",
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
