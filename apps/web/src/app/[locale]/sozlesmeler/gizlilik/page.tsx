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
  const t = await getTranslations({ locale, namespace: "web.marketing.legal.gizlilik" });
  return buildMetadata({
    locale,
    // Hukuki metin yalnız Türkçe: EN/RU sayfanın kanoniği Türkçe adres.
    locales: LEGAL_DOC_LOCALES,
    title: t("metaTitle"),
    description: t("metaDesc"),
    path: "/sozlesmeler/gizlilik",
  });
}

export default async function Page({ params }: { params: LocaleParams }) {
  setRequestLocale(await localeFromParams(params));
  return (
    <LegalDoc
      path="/sozlesmeler/gizlilik"
      title="Gizlilik Politikası"
      updatedAt="2026-10-16"
      sections={[
        {
          paragraphs: [
            `Bu Gizlilik Politikası, ${OPERATOR.legalName} tarafından işletilen Rothern platformunda (www.rothern.com web sitesi ile Rothern iOS ve Android mobil uygulamaları) kişisel verilerinizin ve ticari bilgilerinizin nasıl korunduğunu özetler. Kişisel verilerin işlenmesine ilişkin ayrıntılı bilgilendirme KVKK Aydınlatma Metni'nde, saklama süreleri ve imha kuralları Kişisel Veri Saklama ve İmha Politikası'nda yer alır; bu politika onları tamamlar.`,
          ],
        },
        {
          heading: "1. Hangi Verileri Topluyoruz",
          paragraphs: [
            /* Ödeme cümlesi (2026-10-16): platform şu an ödeme ALMAZ (ücretsiz dönem,
               mağaza beyanı "ödeme yok"); m.4'te ödeme sağlayıcısı da yok. Mesafeli
               satış sözleşmesi ileride ücretli hizmeti anlatır — cümle ikisini de doğru tutar. */
            "Hesap ve firma bilgileri (ad-soyad, e-posta, telefon, firma unvanı/vergi bilgileri; firma doğrulaması için firma yetkilisinin kimlik numarası ve kimlik belgesi), platformda yürüttüğünüz işlemlere ait kayıtlar (satın alma talebi, teklif, sipariş, mesaj) ve hizmetin güvenliği için gerekli teknik kayıtlar (IP, oturum ve log verileri). Platform üzerinden şu anda ödeme alınmaz; ileride ücretli bir hizmet için ödeme alınırsa kart bilgisi Rothern tarafından saklanmaz ve ödeme, yetkili bir ödeme kuruluşunun güvenli altyapısı üzerinden gerçekleşir.",
            "Mobil uygulamada anlık bildirime izin verirseniz cihazınızın bildirim belirteci ve cihaz türü (iOS/Android) işlenir. Giriş yapmış bir üye olarak başka bir firmanın profilini ya da ürününü görüntülediğinizde bu görüntüleme, o firmanın \"Ziyaret Edenler\" ekranında firmanızın adıyla gösterilebilir (kişi adınız gösterilmez); firmanız bunu Ziyaret Edenler sayfasındaki ayardan kapatabilir. Giriş yapılmadan görüntülenen profil ve ürün sayfaları ise yalnız sayılır: bunun için IP adresi ve tarayıcı bilgisinden her gün yeniden üretilen tek yönlü bir özet kullanılır, IP adresinin kendisi bu amaçla saklanmaz. Görüntülenme kayıtları 180 gün sonra silinir.",
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
            "Bir satın alma talebinin görünürlüğünü \"herkese açık\" seçtiğinizde o talep, giriş gerektirmeyen pazar yeri sayfalarında yayımlanabilir ve arama motorlarınca dizinlenebilir: talep numarası, başlık, açıklama, kategori, kalemler, miktar/birim, teslimat ve ödeme koşulları, son teklif tarihi ile firmanızın ülkesi, sektörü ve faaliyet tipi. Bu talep sayfalarında firma adınız gösterilmez. Teklifler bu kapsamın dışındadır ve kapalı zarf esası aynen geçerlidir (madde 2). Yayımı talep bazında (görünürlük değiştirme veya arama motoru dizinlemesini kapatma) ya da firma ayarlarından toptan durdurabilirsiniz.",
            "Firma profiliniz (firma adı, logo, tanıtım metni, web sitesi gibi profilinizde yer verdiğiniz bilgiler ve yayımladığınız ürünler) ise kayıt tamamlandığında giriş gerektirmeyen firma profili sayfasında herkese açık yayımlanır, firma vitrininde listelenebilir ve arama motorlarınca dizinlenebilir. Profilin yayınını panelde Profilim sayfasındaki \"Herkese açık profil\" anahtarıyla dilediğiniz zaman kapatabilirsiniz.",
          ],
        },
        {
          heading: "4. Verilerin Paylaşımı",
          paragraphs: [
            "Verileriniz üçüncü kişilere satılmaz veya kiralanmaz. Yalnız işlem yaptığınız firmalarla (talep, teklif, sipariş, mesaj ve bağlantı süreçlerinde; madde 2–3), hizmetin çalışması için gereken hizmet sağlayıcılarıyla (barındırma, veritabanı, dosya depolama, e-posta, kurumsal e-posta, hata izleme; yapay zekâ özellikleri için Google; mobil uygulamanın anlık bildirimleri için Google Firebase Cloud Messaging ve iOS cihazlarda Apple — güncel liste KVKK Aydınlatma Metni'ndedir) ve yasal zorunluluk hâlinde yetkili kurumlarla paylaşılır. Veri işleyen sağlayıcılar verilerinizi yalnız hizmetin sunulması amacıyla ve Rothern'in talimatları doğrultusunda işler; verilerinizi bu politikada belirtilen korumayla aynı ya da ona eşdeğer düzeyde korumakla yükümlüdür.",
            "Sağlayıcıların tamamı yurt dışında yerleşiktir. Yurt dışındaki veri işleyen sağlayıcılara aktarım, KVKK m. 9/4-c uyarınca Kişisel Verileri Koruma Kurulu'nun ilan ettiği standart sözleşmelere dayanır; açık rızanıza bağlı değildir ve Platform'u kullanmanız bu aktarıma rıza vermenizi gerektirmez. Sağlayıcıların unvanı, ülkesi, verilerin tutulduğu yer ve aktarılan veriler ile iOS anlık bildirimlerini ileten Apple'ın durumu KVKK Aydınlatma Metni'nin 4. maddesinde yer alır.",
          ],
        },
        {
          heading: "5. Güvenlik Önlemleri",
          paragraphs: [
            "Tüm trafik SSL/TLS ile şifrelenir. Oturumlar httpOnly çerezlerle taşınır (istemci betikleri erişemez), tüm mutasyonlarda CSRF koruması uygulanır, kritik işlemler denetim kaydına (audit log) yazılır ve firma verileri çok-kiracılı izolasyonla ayrıştırılır. Yalnızca hizmet için zorunlu çerezler kullanılır; reklam/izleme çerezi yoktur. Ürün sayfalarında satıcının eklediği YouTube veya Vimeo videoları gömülü oynatılır: video yüklendiğinde tarayıcınız bu sağlayıcıların sunucularına bağlanır ve IP adresiniz onlara iletilir; YouTube videoları çerezsiz alan adından, Vimeo videoları izleme kapalı kipte yüklenir.",
          ],
        },
        {
          /* Mağaza hesap silme adresi bu maddeye ve `/hesap-silme` sayfasına
             dayanır (Play: silme yolu politikada çapayla bulunabilmeli; Apple
             5.1.1: silme nasıl istenir, ne saklanır). Metin `AccountDeletionService`
             davranışının özetidir — kural değişirse bu madde, KVKK m.7/m.9,
             `/hesap-silme`, Kullanıcı Sözleşmesi m.8 ve Saklama ve İmha Politikası
             (tablonun 1–2. satırları) birlikte güncellenir. "anonim" DENMEZ: kayıt kimliği
             firma kayıtlarına bağlı kalır (takma adlı, anonim değil). 30 gün sözü
             `ClosedCompanyErasureScheduler` + admin "KVKK silme bekliyor" süzgeciyle
             takip edilir; girişsiz talep admin "KVKK: Hesabı Sil" ile yapılır
             (giriş yapabilen hesapta API reddeder; talep kayıtlı adrese yazılarak
             doğrulanır). Aktivite Logu'ndaki kısa kod `deletedAccountTag`. */
          heading: "6. Hesabınızı Silme",
          paragraphs: [
            "Hesabınızı kendiniz silebilirsiniz (aşağıda açıklanan Kurucu ve tek kullanıcı durumları saklıdır): Rothern mobil uygulamasında ya da www.rothern.com'da giriş yaptıktan sonra Ayarlar › Hesap Bilgileri › Hesabı sil adımlarını izleyip şifrenizle onaylamanız yeterlidir. Şirket bilgilerini henüz tamamlamadıysanız ya da açılışta sözleşme onayı penceresi çıkıyorsa, o ekrandaki \"Hesabımı sil\" düğmesini kullanabilirsiniz. Silme için e-posta göndermeniz ya da destekle görüşmeniz gerekmez; işlem hemen gerçekleşir ve geri alınamaz.",
            "Silme anında giriş bilgileriniz silinir. Adınız, soyadınız, telefon numaranız ve e-posta adresiniz hesap kaydından kaldırılır; kayıt bundan sonra \"Silinmiş Kullanıcı\" adıyla görünür. E-posta adresiniz ayrıca yapay zekâ kullanım kayıtlarından ve size gönderilmiş ekip davetlerinden kaldırılır. Bildirimleriniz, bildirim tercihleriniz, cihaz bildirim kayıtlarınız, iki adımlı doğrulama ayarlarınız ve yapay zekâ asistanı sohbetleriniz silinir, isteğe bağlı ticari elektronik ileti onayınız geri alınır ve tüm cihazlardaki oturumlarınız sona erer. Firma yöneticiniz sizi ekipten çıkarırsa da giriş bilgileriniz, e-posta adresiniz, telefon numaranız, iki adımlı doğrulama ayarlarınız, bildirimleriniz ve asistan sohbetleriniz çıkarıldığınız anda silinir; adınız, firmanın kayıtlarında işlemi yapanın görünmesi için firmada kalır ve silinmesini aşağıdaki yoldan isteyebilirsiniz.",
            "Firmanıza ait talep, teklif, sipariş, onay, mesaj ve belge kayıtları firmanın ve karşı tarafların ticari kayıtları olduğu için silinmez; bu kayıtlarda ve firmanızın Aktivite Logu'nda hesabınız \"Silinmiş Kullanıcı\" olarak görünür (Aktivite Logu'nda silinen hesapları birbirinden ayırmak için adın yanında kısa bir kod bulunur), gönderdiğiniz mesajlarda ise gönderen adı gönderim anındaki hâliyle kalır. Firma kaydındaki bilgiler (firma yetkilisinin kimlik numarası ve kimlik belgesi görüntüleri, şahıs firmalarında vergi numarası olarak kullanılan T.C. kimlik numarası, işyeri adresi, firmanın fatura e-posta adresi ve telefonu) firmaya aittir; sizin bilgileriniz olsalar da firma faaliyetini sürdürdükçe firmada kalır ve firma kapandığında aşağıdaki kurala göre silinir. Saklanan kayıtlar, yasal yükümlülükler ve olası uyuşmazlıklarda ispat amacıyla Kişisel Veri Saklama ve İmha Politikası'ndaki süreler boyunca tutulur: ticari kayıtlar, ticari yazışmalar ve ticari işlemlere ilişkin e-posta gönderim kayıtları, kaydın oluştuğu takvim yılının sonundan itibaren 10 yıl; diğer e-posta gönderim kayıtları 1 ya da 2 yıl; denetim kayıtları (giriş ve işlem kayıtları; işlem anındaki e-posta adresinizle birlikte) 10 yıl, bu kayıtlardaki IP adresi ve tarayıcı bilgisi ise en fazla 2 yıl; sözleşme onay tarihleriniz, bağlı ticari kayıtlar saklandığı sürece. Diğer kullanıcılara daha önce gönderilmiş bildirim ve e-postalarda adınız geçebilir; bunlar alıcıların hesabında ve gönderim kayıtlarında kalır. E-posta aboneliğinden çıktıysanız bu kayıt (yalnız adresiniz ve çıkış kapsamı), size yeniden e-posta gönderilmemesi için süresiz saklanır. Sistem yedeklerindeki kopyalar, yedeklerin olağan yenilenme döngüsünde silinir.",
            "Firmanın Kurucusuysanız ve firmada başka kullanıcılar varsa (pasif olanlar dahil), önce kuruculuğu başka bir kullanıcıya devretmeniz ya da diğer kullanıcıları firmadan çıkarmanız gerekir; silmeden sonra firmada kullanıcıları yönetebilecek en az bir aktif kişi kalmalıdır. Firmanın tek kullanıcısıysanız firma hesabı da kapanır ve herkese açık profili yayından kalkar; süren sipariş ya da açık talep varken bu yapılamaz. Kapanan firmanın vergi, adres, banka ve doğrulama belgesi gibi firma bilgileri, saklanması kanunen zorunlu olanlar dışında, Rothern tarafından en geç 30 gün içinde silinir; firmanın geçmiş ticari kayıtları varsa firma kaydı \"Silinmiş Firma\" adıyla kalır.",
            `Uygulamayı kaldırdıysanız aynı adımları web sitesinde izleyebilirsiniz. Hesabınıza giriş yapamıyorsanız ya da yukarıdaki koşulları yerine getiremiyorsanız (örneğin kuruculuğu devredecek kimse yoksa ya da bir sipariş sonuçlandırılamıyorsa), silme talebinizi kayıtlı e-posta adresinizden ${OPERATOR.kvkkEmail} adresine iletebilirsiniz; talebi doğrulamak için hesabınıza kayıtlı (ekipten çıkarıldıysanız en son kullandığınız) adrese yazar ve onayınızı oradan isteriz. Talepler en geç 30 gün içinde ücretsiz olarak sonuçlandırılır. Kayıt formundan açılıp e-posta adresi doğrulanmayan hesaplar ise 7 gün dolduktan sonra kendiliğinden silinir.`,
          ],
          links: [
            { href: "/hesap-silme", label: "Hesap silme: adımlar, silinen ve saklanan bilgiler" },
            { href: "/sozlesmeler/saklama-imha", label: "Kişisel Veri Saklama ve İmha Politikası" },
          ],
        },
        {
          heading: "7. Haklarınız ve İletişim",
          paragraphs: [
            `Verilerinize erişme, düzeltme ve silme talepleriniz ile açık rızanızı geri alma bildiriminiz için ${OPERATOR.kvkkEmail} adresine başvurabilirsiniz (usul ve tüm haklar için KVKK Aydınlatma Metni'ne bakın). E-posta bildirimlerini Ayarlar › Bildirim Tercihleri sayfasından ya da bildirim e-postalarının altındaki abonelikten çıkma bağlantısıyla, mobil uygulamanın anlık bildirimlerini cihazınızın ayarlarından kapatabilirsiniz. Genel sorular için: ${OPERATOR.supportEmail}.`,
          ],
        },
      ]}
    />
  );
}
