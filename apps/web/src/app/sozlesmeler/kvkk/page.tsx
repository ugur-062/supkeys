import { LegalDoc } from "@/components/marketing/legal-doc";
import { OPERATOR } from "@/lib/company-info";

export const metadata = { title: "KVKK Aydınlatma Metni — Rothern" };

export default function Page() {
  return (
    <LegalDoc
      title="Kişisel Verilerin Korunması Hakkında Aydınlatma Metni"
      updatedAt="26 Temmuz 2026"
      sections={[
        {
          paragraphs: [
            `İşbu Aydınlatma Metni, 6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") uyarınca, veri sorumlusu sıfatıyla ${OPERATOR.legalName} ("Rothern" markasıyla, "Platform") tarafından, www.rothern.com adresinde sunulan B2B e-tedarik ve e-ihale platformunun kullanımı kapsamında kişisel verilerinizin işlenmesine ilişkin olarak sizleri bilgilendirmek amacıyla hazırlanmıştır. Veri sorumlusunun adresi: ${OPERATOR.address}.`,
            "Platform, firmalar (tüzel ve gerçek kişi tacirler) arasında satın alma ve satış süreçlerine aracılık eden bir iş uygulamasıdır; kişisel veriler ağırlıklı olarak firma yetkilisi ve firma çalışanı sıfatıyla hareket eden gerçek kişilere aittir.",
          ],
        },
        {
          heading: "1. İşlenen Kişisel Veriler",
          list: [
            "Kimlik bilgileri: ad, soyad; şahıs firmalarında T.C. kimlik numarası (vergi mükellefiyeti doğrulaması amacıyla).",
            "İletişim bilgileri: e-posta adresi, telefon numarası, işyeri adresi.",
            "Firma ve mali bilgiler: firma unvanı, vergi kimlik numarası, vergi dairesi, fatura ve teslimat adresleri, banka hesap (IBAN) bilgileri, vergi levhası ve benzeri doğrulama belgeleri.",
            "İşlem verileri: ihale, teklif, sipariş, onay ve mesajlaşma kayıtları; platforma yüklenen belge ve görseller.",
            "İşlem güvenliği verileri: IP adresi, oturum ve log kayıtları, çerez verileri.",
          ],
        },
        {
          heading: "2. İşleme Amaçları",
          list: [
            "Üyelik hesabının oluşturulması, doğrulanması ve yönetimi; firma doğrulama (KYB) süreçlerinin yürütülmesi.",
            "İhale açma, teklif toplama, değerlendirme, kazandırma ve sipariş süreçlerine aracılık edilmesi.",
            "İşlemlere ilişkin zorunlu bildirimlerin (e-posta ve platform içi) iletilmesi.",
            "Platform güvenliğinin sağlanması, hataların tespiti, denetim izlerinin (audit log) tutulması ve kötüye kullanımın önlenmesi.",
            "Yasal yükümlülüklerin yerine getirilmesi ve yetkili kurumların taleplerinin karşılanması.",
            "Açık rıza vermeniz hâlinde: profil ve hizmet iyileştirme çalışmaları ile pazarlama/analitik amaçlı ticari elektronik ileti gönderimi.",
          ],
        },
        {
          heading: "3. İşlemenin Hukuki Sebepleri",
          paragraphs: [
            "Kişisel verileriniz; KVKK m. 5/2-c uyarınca sözleşmenin kurulması ve ifası, m. 5/2-ç uyarınca hukuki yükümlülüklerimizin yerine getirilmesi, m. 5/2-e uyarınca bir hakkın tesisi, kullanılması veya korunması ve m. 5/2-f uyarınca temel hak ve özgürlüklerinize zarar vermemek kaydıyla meşru menfaatlerimiz hukuki sebeplerine dayanılarak işlenir. Opsiyonel pazarlama ve profil iyileştirme işlemeleri ile yurt dışına aktarım, yalnızca açık rızanıza dayanır.",
          ],
        },
        {
          heading: "4. Aktarılan Taraflar ve Yurt Dışına Aktarım",
          paragraphs: [
            "Platformun teknik altyapısı, sektörde yaygın kullanılan yurt dışı merkezli hizmet sağlayıcılar üzerinde çalışır. Bu kapsamda kişisel verileriniz, hizmetin sunulabilmesi için gerekli olduğu ölçüde ve KVKK m. 9 uyarınca açık rızanıza dayanılarak aşağıdaki sağlayıcılara aktarılabilir:",
          ],
          list: [
            "Supabase (veritabanı ve kimlik doğrulama — AB/Frankfurt bölgesi)",
            "Vercel (web uygulaması barındırma)",
            "Render (API sunucusu barındırma)",
            "Cloudflare (R2 dosya depolama — yüklenen belge ve görseller)",
            "Resend (işlemsel e-posta gönderimi)",
            "Google (yapay zekâ özellikleri — belge çıkarımı ve asistan kullanımında işlenen içerikler)",
            "Sentry (hata izleme — kişisel veri içermeyecek şekilde maskeleme uygulanır)",
          ],
        },
        {
          heading: "5. Toplama Yöntemi",
          paragraphs: [
            "Kişisel verileriniz; kayıt ve profil formları, platform üzerindeki işlem ve mesajlaşma ekranları, yüklediğiniz belgeler ile otomatik yöntemlerle (oturum ve log kayıtları, çerezler) elektronik ortamda toplanır.",
          ],
        },
        {
          heading: "6. Çerezler",
          paragraphs: [
            "Platform, yalnızca hizmetin çalışması için zorunlu çerezleri kullanır: oturum kimliğini taşıyan httpOnly çerezler ile güvenlik amaçlı CSRF çerezleri. Üçüncü taraf reklam veya izleme çerezi kullanılmaz. Zorunlu çerezler engellendiğinde platforma giriş yapılamaz.",
          ],
        },
        {
          heading: "7. Saklama Süreleri",
          paragraphs: [
            "Kişisel verileriniz, üyelik ilişkisi süresince ve sona ermesinden itibaren ilgili mevzuatta öngörülen zamanaşımı ve saklama süreleri (Türk Ticaret Kanunu ve Vergi Usul Kanunu kapsamında 10 yıla kadar) boyunca saklanır; ticari işlem kayıtları ve denetim izleri bu sürelerle sınırlı olarak muhafaza edilir. Süre sonunda veriler silinir, yok edilir veya anonim hâle getirilir.",
          ],
        },
        {
          heading: "8. KVKK m. 11 Kapsamındaki Haklarınız",
          list: [
            "Kişisel verilerinizin işlenip işlenmediğini öğrenme ve işlenmişse buna ilişkin bilgi talep etme,",
            "İşleme amacını ve amaca uygun kullanılıp kullanılmadığını öğrenme,",
            "Yurt içinde veya yurt dışında verilerin aktarıldığı üçüncü kişileri bilme,",
            "Eksik veya yanlış işlenmiş verilerin düzeltilmesini isteme,",
            "KVKK m. 7 çerçevesinde silinmesini veya yok edilmesini isteme,",
            "Düzeltme/silme işlemlerinin aktarım yapılan üçüncü kişilere bildirilmesini isteme,",
            "Münhasıran otomatik sistemlerle analiz sonucu aleyhinize bir sonucun ortaya çıkmasına itiraz etme,",
            "Kanuna aykırı işleme sebebiyle zarara uğramanız hâlinde zararın giderilmesini talep etme.",
          ],
        },
        {
          heading: "9. Başvuru",
          paragraphs: [
            "Haklarınıza ilişkin taleplerinizi, Veri Sorumlusuna Başvuru Usul ve Esasları Hakkında Tebliğ'e uygun olarak kvkk@rothern.com adresine iletebilirsiniz. Başvurularınız en geç 30 gün içinde ücretsiz olarak sonuçlandırılır; işlemin ayrıca bir maliyet gerektirmesi hâlinde Kişisel Verileri Koruma Kurulu tarafından belirlenen tarifedeki ücret alınabilir.",
            "Platform, işbu Aydınlatma Metni'ni mevzuat ve hizmet kapsamındaki değişikliklere bağlı olarak güncelleyebilir; güncel metin her zaman bu sayfada yayımlanır.",
          ],
        },
      ]}
    />
  );
}
