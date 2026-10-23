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
  const t = await getTranslations({ locale, namespace: "web.marketing.legal.kullanici" });
  return buildMetadata({
    locale,
    // Hukuki metin yalnız Türkçe: EN/RU sayfanın kanoniği Türkçe adres.
    locales: LEGAL_DOC_LOCALES,
    title: t("metaTitle"),
    description: t("metaDesc"),
    path: "/sozlesmeler/kullanici",
  });
}

export default async function Page({ params }: { params: LocaleParams }) {
  setRequestLocale(await localeFromParams(params));
  return (
    <LegalDoc
      path="/sozlesmeler/kullanici"
      title="Kullanıcı Sözleşmesi"
      updatedAt="2026-10-22"
      sections={[
        {
          heading: "1. Taraflar ve Konu",
          paragraphs: [
            `İşbu Kullanıcı Sözleşmesi ("Sözleşme"), Rothern platformunun işletmecisi ${OPERATOR.legalName} ("Platform") ile www.rothern.com üzerinde hesap oluşturan gerçek veya tüzel kişi ("Kullanıcı") arasında, hesabın elektronik ortamda onaylandığı anda kurulmuş ve yürürlüğe girmiş sayılır.`,
            "Sözleşme'nin konusu; Kullanıcı'nın Platform'da sunulan B2B e-tedarik ve e-satın alma talebi hizmetlerinden yararlanmasına ilişkin tarafların hak ve yükümlülüklerinin belirlenmesidir. Platform üzerinden yürütülen alım-satım süreçlerine ilişkin özel hükümler, ayrıca kabul edilen Platform Aracılık ve Kullanım Sözleşmesi'nde düzenlenir.",
          ],
        },
        {
          heading: "2. Ticari Nitelik",
          paragraphs: [
            "Platform münhasıran işletmeler arası (B2B) kullanım içindir. Kullanıcı, Platform'u ticari veya mesleki faaliyeti kapsamında kullandığını, 6502 sayılı Tüketicinin Korunması Hakkında Kanun anlamında tüketici sıfatı taşımadığını kabul eder.",
          ],
        },
        {
          heading: "3. Hesap Oluşturma ve Doğrulama",
          paragraphs: [
            "Kullanıcı, kayıt sırasında verdiği tüm bilgilerin (firma unvanı, vergi kimlik numarası, iletişim bilgileri ve doğrulama belgeleri dâhil) doğru, güncel ve kendisine/temsil ettiği firmaya ait olduğunu beyan eder. Platform, hesapları doğrulama sürecine tabi tutma, ek belge isteme ve doğrulanamayan hesapları onaylamama veya askıya alma hakkını saklı tutar.",
            "Firma hesabı altında birden fazla kullanıcı tanımlanabilir; firma adına yetkilendirilen her kullanıcının işlemi firmayı bağlar. Kullanıcı rollerinin ve yetkilerinin doğru yönetilmesinden firma sorumludur.",
          ],
        },
        {
          heading: "4. Hesap Güvenliği",
          paragraphs: [
            "Hesap giriş bilgilerinin gizliliğinden ve hesap üzerinden gerçekleştirilen her türlü işlemden Kullanıcı sorumludur. Yetkisiz kullanım şüphesinde Kullanıcı, durumu derhâl Platform'a bildirmekle yükümlüdür. Ayrılan çalışanların erişimlerinin kapatılması firmanın sorumluluğundadır.",
          ],
        },
        {
          heading: "5. Kullanım Kuralları",
          paragraphs: ["Kullanıcı, Platform'u kullanırken aşağıdaki davranışlardan kaçınmayı kabul eder:"],
          list: [
            "Gerçeğe aykırı, yanıltıcı veya üçüncü kişilerin haklarını ihlal eden içerik, satın alma talebi, teklif veya belge yüklemek,",
            "Satın Alma Talebi ve teklif süreçlerini manipüle etmek (danışıklı teklif, fiyat anlaşması, sahte hesapla teklif dâhil),",
            "Platform'un altyapısına zarar verecek, işleyişini bozacak veya güvenlik önlemlerini aşmaya yönelik girişimlerde bulunmak,",
            "Diğer kullanıcıların verilerini hukuka aykırı şekilde toplamak, kopyalamak veya üçüncü kişilerle paylaşmak,",
            "Platform'u yürürlükteki mevzuata, dürüstlük kuralına veya işbu Sözleşme'ye aykırı herhangi bir amaçla kullanmak.",
          ],
        },
        {
          heading: "6. İçerik ve Fikri Mülkiyet",
          paragraphs: [
            "Platform'un yazılımı, tasarımı, markası ve tüm bileşenleri üzerindeki fikri ve sınai mülkiyet hakları Rothern'e aittir; Kullanıcı'ya yalnızca hizmetten yararlanma amacıyla sınırlı, devredilemez bir kullanım hakkı tanınır.",
            "Kullanıcı'nın Platform'a yüklediği içeriklerin (satın alma talebi, belge, görsel, mesaj) hukuka uygunluğundan Kullanıcı sorumludur. Kullanıcı, bu içeriklerin hizmetin sunulması amacıyla Platform tarafından barındırılmasına ve işlenmesine izin verir.",
          ],
        },
        {
          heading: "7. Hizmetin Kapsamı ve Değişiklikler",
          paragraphs: [
            "Platform, hizmetin kapsamını, özelliklerini ve ücretsiz/ücretli hizmet içeriklerini değiştirme, geliştirme veya sonlandırma hakkını saklı tutar; Kullanıcı aleyhine esaslı değişiklikler makul süre önceden duyurulur.",
            "Platform'da yer alan yapay zekâ destekli özellikler (belgeden talep ve teklif fiyatı doldurma, yapay zekâ ile arama, başlık ve kategori önerisi, açıklama ve tanıtım metni önerileri, asistan, tedarikçi araması, içeriklerin otomatik çevirisi) yardımcı niteliktedir. Kullanıcı'nın kullandığı ya da kabul ettiği öneri, taslak ve sonuçların doğruluğunun kontrolü Kullanıcı'ya aittir; içeriklerin otomatik çevirisinde esas olan, Kullanıcı'nın girdiği özgün metindir. Kullanıcı, talep formunda yapay zekânın tedarikçi bulup davet etmesi seçeneğini açık bırakırsa, talep yayımlandıktan sonra bulunan ve davete uygun firmalar, talebi yayımlayan Kullanıcı adına ve talepteki ayara göre davet eden firmanın adı gösterilerek ya da gösterilmeden otomatik olarak davet edilir; bu seçenek talep bazında kapatılabilir.",
          ],
        },
        {
          /* Kapatma koşulları `AccountDeletionService`in kurallarıdır (Kurucu
             devri, son yönetici, son kullanıcıda süren iş); TBK m.20-25 gereği
             fiilî kısıt sözleşmede açıkça yazılır. Kural değişirse bu madde,
             Gizlilik m.6, KVKK m.7/m.9, `/hesap-silme` ve Saklama ve İmha
             Politikası birlikte güncellenir. Metin değişikliği yeniden onay
             istemez (onay kapısı yalnız boş onay tarihine bakar); m.11 gereği
             esaslı değişiklik kullanıcılara bildirilir — yayın günü uygulama
             içi + e-posta bildirimi operatör adımıdır (`docs/kvkk-uyum.md`
             "Yayın sonrası açık adımlar"; yeniden onay gerekip gerekmediği
             avukat sorusu 9). */
          heading: "8. Askıya Alma, Hesabın Kapatılması ve Fesih",
          paragraphs: [
            "Platform; işbu Sözleşme'ye, Aracılık Sözleşmesi'ne veya mevzuata aykırılık hâlinde Kullanıcı hesabını geçici olarak askıya alabilir veya Sözleşme'yi haklı nedenle feshedebilir.",
            "Kullanıcı, hesabını Platform'da Ayarlar › Hesap Bilgileri › Hesabı sil adımlarıyla (şirket bilgileri henüz tamamlanmamışsa ya da sözleşme onayı penceresi açıksa o ekrandaki \"Hesabımı sil\" düğmesiyle) şifresini girerek kapatabilir ve böylece işbu Sözleşme'yi kendisi bakımından sona erdirebilir; firmada başka kullanıcı varsa Sözleşme firma ve diğer kullanıcılar bakımından devam eder. Kapatma hemen gerçekleşir ve geri alınamaz. Hesabın kapatılması aşağıdaki koşullara bağlıdır; koşullar sağlanmadıkça Platform kapatma işlemini gerçekleştirmez ve nedenini Kullanıcı'ya bildirir:",
          ],
          list: [
            "Firmanın Kurucusu olan Kullanıcı, firmada başka kullanıcılar (pasif olanlar dâhil) bulunduğu sürece hesabını kapatamaz; önce Kurucu rolünü başka bir kullanıcıya devretmesi ya da diğer kullanıcıları firmadan çıkarması gerekir.",
            "Hesabın kapatılmasından sonra firmada, kullanıcıları yönetebilecek en az bir aktif kullanıcı (Kurucu ya da kullanıcı yönetimi yetkisi olan bir kullanıcı) kalmalıdır.",
            "Firmanın tek kullanıcısı olan Kullanıcı'nın hesabını kapatması firma hesabını da kapatır ve firmanın herkese açık profili yayından kalkar. Firmanın süren bir siparişi (tamamlanmamış, iptal edilmemiş ve reddedilmemiş) ya da açık bir satın alma talebi (yayın onayı bekleyen, teklif toplayan, değerlendirme ya da kazandırma aşamasındaki) varken bu yapılamaz; Kullanıcı önce bunları sonuçlandırır.",
          ],
        },
        {
          paragraphs: [
            "Hesabın kapatılmasıyla Kullanıcı'nın kişisel verileri Gizlilik Politikası'nın \"Hesabınızı Silme\" maddesi ve Kişisel Veri Saklama ve İmha Politikası uyarınca silinir. Firmanın ve karşı tarafların ticari kayıtları (satın alma talebi, teklif, sipariş, onay, mesaj ve belgeler) silinmez: bu kayıtlar, tarafı olan firmaların ve kullanıcılarının erişiminde kalır ve yasal saklama yükümlülükleri ile 10 yıllık zamanaşımı süresi gözetilerek Kişisel Veri Saklama ve İmha Politikası'ndaki süre boyunca saklanır; Kullanıcı bu kayıtlarda \"Silinmiş Kullanıcı\" olarak görünür, gönderdiği mesajlarda gönderen adı gönderim anındaki hâliyle kalır. Kapanan firmanın firma bilgileri, saklanması kanunen zorunlu olanlar dışında, kapanıştan itibaren en geç 30 gün içinde silinir; firmanın geçmiş ticari kayıtları varsa firma kaydı yalnız \"Silinmiş Firma\" adıyla kalır.",
            `Hesabın kapatılması, kapatmadan önce firma adına yürütülen satın alma talebi, teklif ve sipariş süreçlerinden doğan yükümlülükleri ortadan kaldırmaz. Hesabına giriş yapamayan ya da yukarıdaki koşulları yerine getiremeyen (örneğin Kurucu rolünü devredecek kimse bulunmayan) Kullanıcı, kapatma talebini ${OPERATOR.kvkkEmail} adresine iletebilir; talep en geç 30 gün içinde sonuçlandırılır.`,
          ],
          links: [
            { href: "/hesap-silme", label: "Hesap silme: adımlar, silinen ve saklanan bilgiler" },
            { href: "/sozlesmeler/gizlilik#madde-6", label: "Gizlilik Politikası — Hesabınızı Silme" },
            { href: "/sozlesmeler/saklama-imha", label: "Kişisel Veri Saklama ve İmha Politikası" },
          ],
        },
        {
          heading: "9. Sorumluluğun Sınırlandırılması",
          paragraphs: [
            "Platform, hizmeti \"olduğu gibi\" sunar; kesintisiz veya hatasız çalışacağını taahhüt etmez. Zorunlu bakım, güncelleme veya Platform'un kontrolü dışındaki nedenlerle (altyapı sağlayıcı kesintileri dâhil) oluşan erişim sorunlarından Platform sorumlu tutulamaz.",
            "Platform'un işbu Sözleşme kapsamındaki toplam sorumluluğu, kast ve ağır ihmal hâlleri saklı kalmak üzere, zarara yol açan olaydan önceki 12 ayda ilgili Kullanıcı'dan tahsil edilen hizmet bedeliyle sınırlıdır.",
          ],
        },
        {
          heading: "10. Kişisel Veriler",
          paragraphs: [
            "Kişisel verilerin işlenmesine ilişkin ayrıntılı bilgi KVKK Aydınlatma Metni'nde yer alır. Kullanıcı, firma adına eklediği çalışanlarını Platform'un veri işleme pratikleri konusunda bilgilendirmekle yükümlüdür.",
          ],
        },
        {
          heading: "11. Değişiklikler ve Devir",
          paragraphs: [
            "Platform, işbu Sözleşme'yi güncelleyebilir. Güncel sürüm bu sayfada yayımlanır; esaslı değişiklikler Kullanıcı'ya bildirilir. Değişiklik sonrasında Platform'un kullanılmaya devam edilmesi, güncel Sözleşme'nin kabulü anlamına gelir.",
            "Platform; işbu Sözleşme'den doğan hak ve yükümlülüklerini, hizmetin işletilmesini ve aktif üyelikleri, Kullanıcı'nın kazanılmış hakları korunmak kaydıyla, Rothern markası altında hizmet verecek başka bir tüzel kişiye (grup şirketi veya işletme devri kapsamındaki devralan dâhil) devredebilir. Devir, Kullanıcı'ya bildirilir; ödenmiş üyelik dönemleri devralan nezdinde aynen geçerliliğini korur.",
          ],
        },
        {
          heading: "12. Uygulanacak Hukuk ve Yetki",
          paragraphs: [
            `İşbu Sözleşme Türkiye Cumhuriyeti hukukuna tabidir. Sözleşme'den doğan uyuşmazlıklarda Platform kayıtları (veritabanı, log ve denetim kayıtları dâhil) HMK m. 193 anlamında delil teşkil eder; uyuşmazlıkların çözümünde ${OPERATOR.jurisdiction} yetkilidir.`,
            `Sorular ve bildirimler için: ${OPERATOR.supportEmail}`,
          ],
        },
      ]}
    />
  );
}
