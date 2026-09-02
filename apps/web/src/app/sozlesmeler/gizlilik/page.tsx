import { LegalDoc } from "@/components/marketing/legal-doc";
import { OPERATOR } from "@/lib/company-info";

export const metadata = { title: "Gizlilik Politikası — Rothern" };

export default function Page() {
  return (
    <LegalDoc
      title="Gizlilik Politikası"
      updatedAt="2 Eylül 2026"
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
            "Bir ilanın görünürlüğünü \"herkese açık\" seçtiğinizde o ilan, giriş gerektirmeyen pazar yeri sayfalarında yayımlanabilir ve arama motorlarınca dizinlenebilir: ilan numarası, başlık, açıklama, kategori, kalemler, miktar/birim, teslimat ve ödeme koşulları, son teklif tarihi ile firmanızın adı ve konumu.",
            "Teklifler bu kapsamın dışındadır ve kapalı zarf esası aynen geçerlidir (madde 2). Yayımı ilan bazında (görünürlük değiştirme veya arama motoru dizinlemesini kapatma) ya da firma ayarlarından toptan durdurabilirsiniz.",
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
