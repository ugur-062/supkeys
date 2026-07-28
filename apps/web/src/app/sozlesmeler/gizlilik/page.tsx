import { LegalDoc } from "@/components/marketing/legal-doc";
import { OPERATOR } from "@/lib/company-info";

export const metadata = { title: "Gizlilik Politikası — Rothern" };

export default function Page() {
  return (
    <LegalDoc
      title="Gizlilik Politikası"
      updatedAt="27 Temmuz 2026"
      sections={[
        {
          paragraphs: [
            `Bu Gizlilik Politikası, ${OPERATOR.legalName} tarafından işletilen Rothern platformunda (www.rothern.com) kişisel verilerinizin ve ticari bilgilerinizin nasıl korunduğunu özetler. Kişisel verilerin işlenmesine ilişkin ayrıntılı bilgilendirme KVKK Aydınlatma Metni'nde yer alır; bu politika onu tamamlar.`,
          ],
        },
        {
          heading: "1. Hangi Verileri Topluyoruz",
          paragraphs: [
            "Hesap ve firma bilgileri (ad-soyad, e-posta, telefon, firma unvanı/vergi bilgileri), platformda yürüttüğünüz işlemlere ait kayıtlar (ihale, teklif, sipariş, mesaj) ve hizmetin güvenliği için gerekli teknik kayıtlar (IP, oturum ve log verileri). Kart bilgisi Rothern tarafından saklanmaz; ödemeler, yetkili bir ödeme kuruluşunun güvenli altyapısı üzerinden gerçekleşir.",
          ],
        },
        {
          heading: "2. Ticari Gizlilik — Kapalı Zarf",
          paragraphs: [
            "Teklif içerikleriniz kapalı zarf esasıyla korunur: teklifinizi yalnız ihale sahibi görür; rakip tedarikçiler birbirinin teklifini, kimliğini ve teklif sayısını göremez. Platform çalışanları da ticari verilere yalnız destek/denetim gerekliliği ölçüsünde ve kayıt altında erişir.",
          ],
        },
        {
          heading: "3. Verilerin Paylaşımı",
          paragraphs: [
            "Verileriniz reklam amacıyla üçüncü kişilere satılmaz veya kiralanmaz. Yalnız hizmetin çalışması için gereken altyapı sağlayıcılarıyla (barındırma, veritabanı, e-posta, ödeme, yapay zekâ — güncel liste KVKK Aydınlatma Metni'ndedir) ve yasal zorunluluk hâlinde yetkili kurumlarla paylaşılır.",
          ],
        },
        {
          heading: "4. Güvenlik Önlemleri",
          paragraphs: [
            "Tüm trafik SSL/TLS ile şifrelenir. Oturumlar httpOnly çerezlerle taşınır (istemci betikleri erişemez), tüm mutasyonlarda CSRF koruması uygulanır, kritik işlemler denetim kaydına (audit log) yazılır ve firma verileri çok-kiracılı izolasyonla ayrıştırılır. Yalnızca hizmet için zorunlu çerezler kullanılır; reklam/izleme çerezi yoktur.",
          ],
        },
        {
          heading: "5. Haklarınız ve İletişim",
          paragraphs: [
            `Verilerinize erişme, düzeltme ve silme talepleriniz için ${OPERATOR.kvkkEmail} adresine başvurabilirsiniz (usul ve tüm haklar için KVKK Aydınlatma Metni'ne bakın). Genel sorular için: ${OPERATOR.supportEmail}.`,
          ],
        },
      ]}
    />
  );
}
