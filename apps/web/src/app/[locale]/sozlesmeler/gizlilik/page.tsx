import { localeFromParams, type LocaleParams } from "@/i18n/params";
import type { Metadata } from "next";
import { LegalDoc } from "@/components/marketing/legal-doc";
import { buildMetadata } from "@/lib/seo/meta";
import { OPERATOR } from "@/lib/company-info";

/* "— Rothern" YOK: kök şablon (`%s · Rothern`) markayı ekliyor; elle
   eklenince "… — Rothern · Rothern" çıkıyordu (SEO Parça 7). */
export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const locale = await localeFromParams(params);
  return buildMetadata({
    locale,
  title: "Gizlilik Politikası",
  description:
    "Rothern'de hangi verilerin toplandığı, nasıl işlendiği ve korunduğu; çerezler ve üçüncü taraf hizmetler.",
  path: "/sozlesmeler/gizlilik",
});
}

export default function Page() {
  return (
    <LegalDoc
      path="/sozlesmeler/gizlilik"
      title="Gizlilik Politikası"
      updatedAt="22 Eylül 2026"
      sections={[
        {
          paragraphs: [
            `Bu Gizlilik Politikası, ${OPERATOR.legalName} tarafından işletilen Rothern platformunda (www.rothern.com) kişisel verilerinizin ve ticari bilgilerinizin nasıl korunduğunu özetler. Kişisel verilerin işlenmesine ilişkin ayrıntılı bilgilendirme KVKK Aydınlatma Metni'nde yer alır; bu politika onu tamamlar.`,
          ],
        },
        {
          heading: "1. Hangi Verileri Topluyoruz",
          paragraphs: [
            "Hesap ve firma bilgileri (ad-soyad, e-posta, telefon, firma unvanı/vergi bilgileri), platformda yürüttüğünüz işlemlere ait kayıtlar (satın alma talebi, teklif, sipariş, mesaj) ve hizmetin güvenliği için gerekli teknik kayıtlar (IP, oturum ve log verileri). Kart bilgisi Rothern tarafından saklanmaz; ödemeler, yetkili bir ödeme kuruluşunun güvenli altyapısı üzerinden gerçekleşir.",
          ],
        },
        {
          heading: "2. Ticari Gizlilik — Kapalı Zarf",
          paragraphs: [
            "Teklif içerikleriniz kapalı zarf esasıyla korunur: teklifinizi yalnız satın alma talebi sahibi görür; rakip tedarikçiler birbirinin teklifini, kimliğini ve teklif sayısını göremez. Platform çalışanları da ticari verilere yalnız destek/denetim gerekliliği ölçüsünde ve kayıt altında erişir.",
          ],
        },
        {
          heading: "3. Herkese Açık Görünen Bilgiler",
          paragraphs: [
            "Bir satın alma talebinin görünürlüğünü \"herkese açık\" seçtiğinizde o talep, giriş gerektirmeyen pazar yeri sayfalarında yayımlanabilir ve arama motorlarınca dizinlenebilir: talep numarası, başlık, açıklama, kategori, kalemler, miktar/birim, teslimat ve ödeme koşulları, son teklif tarihi ile firmanızın şehri, ülkesi, sektörü ve faaliyet tipi. Firma adınız ve profiliniz yalnız giriş yapmış üyelere görünür.",
            "Teklifler bu kapsamın dışındadır ve kapalı zarf esası aynen geçerlidir (madde 2). Yayımı talep bazında (görünürlük değiştirme veya arama motoru dizinlemesini kapatma) ya da firma ayarlarından toptan durdurabilirsiniz.",
          ],
        },
        {
          heading: "4. Verilerin Paylaşımı",
          paragraphs: [
            "Verileriniz reklam amacıyla üçüncü kişilere satılmaz veya kiralanmaz. Yalnız hizmetin çalışması için gereken altyapı sağlayıcılarıyla (barındırma, veritabanı, e-posta, ödeme, yapay zekâ — güncel liste KVKK Aydınlatma Metni'ndedir) ve yasal zorunluluk hâlinde yetkili kurumlarla paylaşılır.",
          ],
        },
        {
          heading: "5. Güvenlik Önlemleri",
          paragraphs: [
            "Tüm trafik SSL/TLS ile şifrelenir. Oturumlar httpOnly çerezlerle taşınır (istemci betikleri erişemez), tüm mutasyonlarda CSRF koruması uygulanır, kritik işlemler denetim kaydına (audit log) yazılır ve firma verileri çok-kiracılı izolasyonla ayrıştırılır. Yalnızca hizmet için zorunlu çerezler kullanılır; reklam/izleme çerezi yoktur.",
          ],
        },
        {
          heading: "6. Haklarınız ve İletişim",
          paragraphs: [
            `Verilerinize erişme, düzeltme ve silme talepleriniz için ${OPERATOR.kvkkEmail} adresine başvurabilirsiniz (usul ve tüm haklar için KVKK Aydınlatma Metni'ne bakın). Genel sorular için: ${OPERATOR.supportEmail}.`,
          ],
        },
      ]}
    />
  );
}
