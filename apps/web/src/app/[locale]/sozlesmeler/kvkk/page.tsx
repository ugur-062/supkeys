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
  const t = await getTranslations({ locale, namespace: "web.marketing.legal.kvkk" });
  return buildMetadata({
    locale,
    // Hukuki metin yalnız Türkçe: EN/RU sayfanın kanoniği Türkçe adres.
    locales: LEGAL_DOC_LOCALES,
    title: t("metaTitle"),
    description: t("metaDesc"),
    path: "/sozlesmeler/kvkk",
  });
}

/*
 * YURT DIŞINA AKTARIM (2026-10-16, kullanıcı kararı): dayanak KVKK m.9/4-c
 * standart sözleşme (SS-2, değiştirilmeden imzalanır, 5 iş günü içinde Kuruma
 * bildirilir — operatör listesi `docs/kvkk-uyum.md`). Açık rıza YALNIZ arızi
 * aktarım için (m.9/6-a); hizmet açık rızaya bağlanmaz, kayıt formundaki KVKK
 * kutusu yalnız bu metnin okunduğunu bildirir. Sağlayıcı listesi (unvan, ülke,
 * veri) `docs/kvkk-uyum.md` sağlayıcı tablosuyla aynı tutulur.
 *
 * METİN MEKANİZMAYI ŞİMDİKİ ZAMANLA YAZAR ("imzalanır ve bildirilir"); bunun
 * gerçek olması ve metnin CANLIYA ÇIKMASI `docs/kvkk-uyum.md` "Canlı kapısı"na
 * bağlıdır (SS-2 imza + bildirim, trafik kayıtları, Apple / yurt dışı karşı
 * taraf için avukat yanıtı, yeterlilik kararı kontrolü). Apple (APNs) veri
 * işleyen listesinde DEĞİL: standart sözleşme imzalamıyor; kendi paragrafı
 * yalnız olguyu yazar, dayanağı avukat yanıtından (kvkk-uyum §10 soru 3) sonra
 * eklenir. Yurt dışındaki karşı taraf firmaya aktarımın m.9 dayanağı da avukat
 * yanıtıyla (soru 5) yazılır — m.8 yalnız yurt içi içindir.
 *
 * SAKLAMA (madde 7) Saklama ve İmha Politikası'nın tablosunun ÖZETİDİR; süre
 * değişirse önce o tablo ve API saklama işleri, sonra bu özet değişir.
 */
export default async function Page({ params }: { params: LocaleParams }) {
  setRequestLocale(await localeFromParams(params));
  return (
    <LegalDoc
      path="/sozlesmeler/kvkk"
      title="Kişisel Verilerin Korunması Hakkında Aydınlatma Metni"
      updatedAt="2026-10-16"
      sections={[
        {
          paragraphs: [
            `İşbu Aydınlatma Metni, 6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") uyarınca, veri sorumlusu sıfatıyla ${OPERATOR.legalName} ("Rothern" markasıyla, "Platform") tarafından, www.rothern.com adresinde ve Rothern iOS ve Android mobil uygulamalarında sunulan B2B e-tedarik ve e-satın alma talebi platformunun kullanımı kapsamında kişisel verilerinizin işlenmesine ilişkin olarak sizleri bilgilendirmek amacıyla hazırlanmıştır. Veri sorumlusunun adresi: ${OPERATOR.address}.`,
            "Platform, firmalar (tüzel ve gerçek kişi tacirler) arasında satın alma ve satış süreçlerine aracılık eden bir iş uygulamasıdır; kişisel veriler ağırlıklı olarak firma yetkilisi ve firma çalışanı sıfatıyla hareket eden gerçek kişilere aittir. Metin; Platform'u ziyaret eden kişileri, Platform üyelerini, Platform'daki bir ürün için bilgi talebi gönderen ziyaretçileri ve bir üyenin satın alma talebine davet edilen, Rothern üyesi olmayan firmaların çalışanlarını kapsar.",
          ],
        },
        {
          heading: "1. İşlenen Kişisel Veriler",
          list: [
            "Kimlik bilgileri: ad, soyad; firma doğrulaması amacıyla firma yetkilisinin T.C. kimlik numarası (yabancı firmalarda isteğe bağlı pasaport ya da ulusal kimlik numarası) ve kimlik kartı ya da pasaport görüntüsü; şahıs firmalarında vergi numarası olarak kullanılan T.C. kimlik numarası (vergi mükellefiyeti doğrulaması amacıyla). Firma doğrulaması için özel nitelikli kişisel veriye ihtiyaç yoktur: kimlik belgesinde din, kan grubu gibi bilgiler yer alıyorsa yüklemeden önce bunları karartın.",
            "İletişim bilgileri: e-posta adresi, telefon numarası, işyeri adresi.",
            "Firma ve mali bilgiler: firma unvanı, vergi kimlik numarası, vergi dairesi, fatura ve teslimat adresleri, banka hesap (IBAN) bilgileri, vergi levhası ve benzeri doğrulama belgeleri.",
            "İşlem verileri: satın alma talebi, teklif, sipariş, onay ve mesajlaşma kayıtları; platforma yüklenen belge ve görseller; firma profili ve ürün görüntülenme kayıtları.",
            "İletişim kayıtları: size gönderilen e-postaların gönderim ve teslim kayıtları, uygulama içi bildirimler, bildirim ve e-posta tercihleriniz, e-posta aboneliğinden çıkma kayıtları.",
            "İşlem güvenliği verileri: IP adresi, oturum ve log kayıtları, denetim kayıtları, çerez verileri, yapay zekâ özelliklerinin kullanım kayıtları.",
            "Cihaz verileri: mobil uygulamada anlık bildirime izin verdiğinizde cihaz bildirim belirteci ve cihaz türü (iOS/Android).",
            "Rothern üyesi olmayan kişilerin verileri: Platform'u ziyaret eden kişinin IP adresi ve tarayıcı bilgisi (erişim kayıtlarında; görüntülenme istatistiği için yalnız bunlardan üretilen tek yönlü özet); Platform'daki bir ürün için bilgi talebi gönderen ziyaretçinin adı, e-posta adresi, telefon numarası, firma adı, mesajı ve talebin gönderildiği IP adresi; bir üyenin satın alma talebine davet edilen firmaların e-posta adresi ile firma adı ve web sitesi.",
          ],
        },
        {
          heading: "2. İşleme Amaçları",
          list: [
            "Üyelik hesabının oluşturulması, doğrulanması ve yönetimi; firma doğrulama (KYB) süreçlerinin yürütülmesi.",
            "Satın Alma Talebi açma, teklif toplama, değerlendirme, kazandırma ve sipariş süreçlerine aracılık edilmesi.",
            "Firma profilinin ve herkese açık olarak yayımlanması seçilen satın alma taleplerinin Platform'da ve arama motorlarında yayımlanması (firma profili Profilim sayfasından, talepler talep ayarlarından yayından kaldırılabilir).",
            "İşlemlere ilişkin zorunlu bildirimlerin (e-posta, platform içi ve mobil uygulamada anlık bildirim) iletilmesi.",
            "Üyelerin satın alma taleplerine ilişkin davetlerin Rothern üyesi olmayan firmalara iletilmesi ve ziyaretçi bilgi taleplerinin ilgili firmaya ulaştırılması.",
            "Platform güvenliğinin sağlanması, hataların tespiti, denetim izlerinin (audit log) tutulması ve kötüye kullanımın önlenmesi.",
            "Yasal yükümlülüklerin yerine getirilmesi (ticari kayıtların ve erişim kayıtlarının saklanması dahil) ve yetkili kurumların taleplerinin karşılanması.",
            "Hizmete ilişkin bilgilendirme e-postalarının (karşılama serisi, haftalık görünürlük özeti, doğrulama ve paket hatırlatmaları, Platform duyuruları) gönderilmesi; onay vermeniz hâlinde Rothern'in kampanya ve tanıtımlarına ilişkin ticari elektronik iletilerin gönderilmesi.",
          ],
        },
        {
          heading: "3. İşlemenin Hukuki Sebepleri",
          paragraphs: ["Kişisel verileriniz, KVKK m. 5/2'de sayılan şu hukuki sebeplere dayanılarak işlenir:"],
          list: [
            "m. 5/2-c — bir sözleşmenin kurulması veya ifasıyla doğrudan ilgili olması: üyelik, firma doğrulaması, satın alma talebi, teklif ve sipariş süreçleri, firma profilinin ve herkese açık seçilen taleplerin yayımlanması, bunlara ilişkin zorunlu bildirimler ve Platform'u kullanan firmaların saklamakla yükümlü oldukları işlem kayıtlarına erişimin sürdürülmesi;",
            "m. 5/2-ç — veri sorumlusunun hukuki yükümlülüğünü yerine getirebilmesi: Rothern'in kendi ticari defter, belge ve yazışmalarının Türk Ticaret Kanunu ve Vergi Usul Kanunu uyarınca saklanması, 5651 sayılı Kanun kapsamındaki erişim (trafik) kayıtlarının saklanması, ticari elektronik ileti almak istemeyenlerin retlerine uyulması, yetkili kurumların talepleri;",
            "m. 5/2-e — bir hakkın tesisi, kullanılması veya korunması: denetim kayıtları ile ticari kayıtların 10 yıllık zamanaşımı süresi boyunca olası uyuşmazlıklarda ispat amacıyla saklanması;",
            "m. 5/2-f — temel hak ve özgürlüklerinize zarar vermemek kaydıyla veri sorumlusunun meşru menfaati: Platform güvenliği, hata izleme ve kötüye kullanımın önlenmesi, üyelerin taleplerine ilişkin davetlerin Rothern üyesi olmayan firmalara iletilmesi, görüntülenme istatistikleri, hizmete ilişkin bilgilendirme e-postaları.",
          ],
        },
        {
          paragraphs: [
            "Rothern'in kampanya ve tanıtımlarına ilişkin ticari elektronik ileti gönderimi yalnız isteğe bağlı açık rızanıza (KVKK m. 5/1) ve 6563 sayılı Kanun uyarınca vereceğiniz onaya dayanır; bu iletiler yalnız onay verenlere ve onay İleti Yönetim Sistemi'ne (İYS) kaydedildikten sonra gönderilir, onay vermemeniz Platform'u kullanmanızı etkilemez. Hizmete ilişkin bilgilendirme e-postaları (karşılama serisi, haftalık görünürlük özeti, doğrulama ve paket hatırlatmaları, Platform duyuruları) rızaya değil m. 5/2-f'ye dayanır ve her e-postanın altındaki bağlantıdan ya da Ayarlar › Bildirim Tercihleri sayfasından kapatılabilir. Yurt dışındaki hizmet sağlayıcılara aktarımın dayanağı 4. maddede açıklanmıştır; bu aktarım açık rızanıza dayanmaz.",
          ],
        },
        {
          heading: "4. Aktarılan Taraflar ve Yurt Dışına Aktarım",
          paragraphs: [
            "Platform'daki firmalar ve yetkili kurumlar: kişisel verileriniz, Platform'un işleyişi gereği ve işlemin gerektirdiği ölçüde, işlem yaptığınız diğer firmalara aktarılır (satın alma talebi, teklif, sipariş, mesajlaşma ve bağlantı süreçlerinde karşı taraf firma ve kullanıcıları; ör. adınız, firmanızın bilgileri, teslimat ve fatura bilgileri). Kişisel verileriniz ayrıca, talep hâlinde ve yalnız kanunen yetkili oldukları ölçüde yetkili kamu kurum ve kuruluşları ile yargı mercilerine aktarılabilir. Yurt içindeki karşı taraflara ve kurumlara aktarım KVKK m. 8/2-a uyarınca 3. maddedeki hukuki sebeplere dayanır. Karşı taraf firma yurt dışında yerleşik olabilir: bu durumda o firmaya yalnız sizin başlattığınız ya da kabul ettiğiniz işlemin (talep, teklif, sipariş, mesaj) gerektirdiği bilgiler, o işlemle birlikte iletilir.",
            "Yurt dışındaki hizmet sağlayıcılar: Platform'un teknik altyapısı yurt dışında yerleşik hizmet sağlayıcılar (veri işleyenler) üzerinde çalışır. Kişisel verileriniz, hizmetin sunulabilmesi için gerekli olduğu ölçüde aşağıdaki sağlayıcılara aktarılır (sağlayıcının unvanı ve ülkesi; verilerin tutulduğu yer; hizmet ve aktarılan veriler):",
          ],
          list: [
            "Supabase Pte. Ltd. (Singapur; veriler Almanya'da, Frankfurt veri merkezinde tutulur) — veritabanı ve kimlik doğrulama: Platform'daki hesap, firma, işlem, iletişim ve güvenlik kayıtları; giriş bilgileri ve şifrenin tek yönlü özeti, giriş sırasında IP adresi.",
            "Vercel Inc. (ABD; sunucu işlevleri Almanya'da, Frankfurt'ta çalışır, sabit içerik küresel ağdan sunulur) — web uygulaması ve yönetim paneli barındırma: sayfa istekleri, IP adresi ve tarayıcı bilgisi, sayfalarda gösterilen veriler.",
            "Render Services, Inc. (ABD; sunucular Almanya'da, Frankfurt'ta çalışır) — API sunucusu barındırma: Platform'a yapılan istekler ve bunlardaki veriler, erişim kayıtları (IP adresi, tarayıcı bilgisi).",
            "Cloudflare, Inc. (ABD; küresel ağ) — dosya depolama (R2: firma doğrulama belgeleri ve kimlik belgesi görüntüleri, talep ve teklif belgeleri, logo ve ürün görselleri) ile alan adı ve içerik dağıtım ağı hizmeti: ziyaretçi IP adresi ve istek bilgileri.",
            "Plus Five Five, Inc. (Resend; ABD) — e-posta gönderimi (işlem, bildirim ve davet e-postaları): alıcının adı ve e-posta adresi, e-posta içeriği, teslim durumu.",
            `Google LLC ve bağlı şirketleri (ABD; Google'ın küresel altyapısı) — yapay zekâ özellikleri: belge çıkarımı, asistan, tedarikçi araması ve ürün/talep/firma metinlerinin otomatik çevirisinde işlenen içerikler; Firebase Cloud Messaging — mobil uygulamaya anlık bildirim iletimi: cihaz bildirim belirteci, bildirim başlığı, metni, türü ve bağlantısı; Google Workspace — kurumsal e-posta: ${OPERATOR.kvkkEmail} ve destek adreslerine yazdığınız e-postalar ve bunlara verilen yanıtlar.`,
            "Functional Software, Inc. (Sentry; ABD; veriler Avrupa Birliği'nde, Almanya'da tutulur) — hata izleme: uygulama hata kayıtları (hata iletisi, istek adresi ve kullanıcı kimliği gibi teknik bilgiler; çerezler, istek gövdesi, IP adresi ve bağlantılardaki jetonlar gönderilmeden ayıklanır).",
          ],
        },
        {
          paragraphs: [
            "Bu aktarımlarda kişisel verileriniz KVKK m. 5/2-c (sözleşmenin kurulması ve ifası) ve m. 5/2-f (meşru menfaat) hukuki sebeplerine dayanılarak işlenir. Aktarımın yapıldığı ülkeler hakkında Kişisel Verileri Koruma Kurulu'nun yeterlilik kararı bulunmadığından yukarıdaki sağlayıcılara aktarım, KVKK m. 9/4-c uyarınca Kurul'un ilan ettiği standart sözleşmeye (veri sorumlusundan veri işleyene aktarım) dayanır: standart sözleşmeler sağlayıcılarla değiştirilmeden imzalanır ve imzaların tamamlanmasından itibaren beş iş günü içinde Kişisel Verileri Koruma Kurumu'na bildirilir; yeni bir sağlayıcıya aktarım bu adımlardan sonra başlar. Standart sözleşmeler, haklarınızı aktarımın yapıldığı ülkede de kullanabilmenizi ve etkili kanun yollarına başvurabilmenizi sağlayan hükümler içerir. Sağlayıcılar verileri yalnız hizmetin sunulması amacıyla ve Rothern'in talimatları doğrultusunda işler.",
            "iOS cihazlara anlık bildirimler, Firebase Cloud Messaging üzerinden, cihazınızın üreticisi Apple Inc.'in (ABD) Apple Push Notification service (APNs) hizmetiyle iletilir: Apple'a cihaz bildirim belirteci ile bildirimin başlığı, metni, türü ve bağlantısı gider. Apple bu hizmeti kendi koşullarıyla sunar; standart sözleşme imzalamadığı için yukarıdaki sağlayıcılar arasında sayılmaz. Anlık bildirimleri cihazınızın ayarlarından kapattığınızda Apple'a bildirim içeriği gönderilmez; bildirimleriniz uygulama içinde ve e-postayla gelmeye devam eder.",
            "Hizmetin sunulması için yapılan bu aktarımlar açık rızanıza dayanmaz; Platform'dan yararlanmanız yurt dışına aktarıma rıza vermenize bağlı değildir. Açık rıza yalnız, yukarıdakiler dışında arızi (düzenli olmayan, tek veya birkaç seferlik) bir aktarım gerekirse ve KVKK m. 9/6'daki diğer hâllerden biri uygulanmıyorsa, muhtemel riskler hakkında bilgilendirilmeniz kaydıyla ayrıca istenir (KVKK m. 9/6-a); bu rızayı vermemeniz Platform'dan yararlanmanızı etkilemez.",
          ],
        },
        {
          heading: "5. Toplama Yöntemi",
          paragraphs: [
            "Kişisel verileriniz; kayıt ve profil formları, platform üzerindeki işlem ve mesajlaşma ekranları, yüklediğiniz belgeler ile otomatik yöntemlerle (oturum ve log kayıtları, çerezler, mobil uygulamada bildirim belirteci) elektronik ortamda toplanır. Bazı veriler Platform'daki diğer kullanıcılar aracılığıyla toplanır: sizi ekibine davet eden firma yöneticisi e-posta adresinizi, sizinle işlem yapan firma işleme ilişkin bilgileri girer. Rothern üyesi olmayan firmaların iletişim bilgileri, davet eden üye tarafından girilir ya da yapay zekâ destekli tedarikçi aramasında herkese açık web kaynaklarından toplanır.",
          ],
        },
        {
          heading: "6. Çerezler",
          paragraphs: [
            "Platform, yalnızca hizmetin çalışması için zorunlu çerezleri kullanır: oturum kimliğini taşıyan httpOnly çerezler, güvenlik amaçlı CSRF çerezleri ve seçtiğiniz dili hatırlayan dil tercihi çerezi. Üçüncü taraf reklam veya izleme çerezi kullanılmaz. Zorunlu çerezler engellendiğinde platforma giriş yapılamaz.",
            "Ürün sayfalarında satıcının eklediği YouTube veya Vimeo videoları sayfaya gömülü oynatılır. Video yüklendiğinde tarayıcınız bu sağlayıcıların (Google LLC / YouTube ve Vimeo, Inc., ABD) sunucularına bağlanır ve IP adresiniz ile tarayıcı bilgileriniz onlara iletilir. YouTube videoları çerezsiz alan adından (youtube-nocookie.com), Vimeo videoları izleme kapalı kipte yüklenir.",
          ],
        },
        {
          heading: "7. Saklama Süreleri ve İmha",
          paragraphs: [
            "Kişisel verileriniz, işlendikleri amaç için gerekli olan ve ilgili mevzuatta öngörülen süre kadar saklanır; süre sonunda silinir, yok edilir veya anonim hâle getirilir. Süreler, saklama sebepleri, imha yöntemleri ve periyodik imha aralığı Kişisel Veri Saklama ve İmha Politikası'nda yer alır. Başlıca süreler:",
          ],
          list: [
            "Hesap verileri (ad, soyad, e-posta adresi, telefon numarası, giriş bilgileri, oturumlar, bildirim cihazı, iki adımlı doğrulama): üyelik süresince; hesabınızı sildiğinizde hemen silinir. Ekipten çıkarılan kullanıcının giriş bilgileri, e-posta adresi, telefon numarası ve iki adımlı doğrulama bilgileri çıkarıldığı anda silinir; adı, firmanın kayıtlarında işlemi yapanın görünmesi için firma kaydıyla birlikte kalır.",
            "Firma kayıtları (unvan, vergi numarası, adresler, banka bilgileri, doğrulama belgeleri, yetkili kimlik bilgileri): firma hesabı açık olduğu sürece; firma kapandıktan sonra en geç 30 gün içinde silinir (geçmiş ticari kayıtları olan firmanın kaydı yalnız \"Silinmiş Firma\" adıyla kalır).",
            "Ticari kayıtlar ve ticari yazışmalar (talep, teklif, sipariş, ödeme bildirimi, değerlendirme, mesaj ve belgeler; ticari işlemlere ilişkin e-posta gönderim kayıtları): kaydın oluştuğu takvim yılının sonundan itibaren 10 yıl. Diğer e-posta gönderim kayıtları: hesap güvenliği ve doğrulama e-postaları ile üye olmayan adreslere giden davetler 1 yıl, öneri, özet, duyuru ve karşılama e-postaları 2 yıl.",
            "Denetim kayıtları: 10 yıl; bu kayıtlardaki IP adresi ve tarayıcı bilgisi 2 yıl dolmadan silinir.",
            "Erişim (trafik) kayıtları: 5651 sayılı Kanun uyarınca en az 1 yıl, en fazla 2 yıl.",
            "Yapay zekâ kullanım kayıtları: kaydın oluştuğu takvim yılının sonundan itibaren 5 yıl (kayıttaki e-posta adresi 1 yıl sonra silinir); yapay zekâ asistanı sohbetleri: son mesajdan 90 gün sonra silinir; yapay zekâ ile işlenmek üzere yüklenen geçici dosyalar: 24 saat.",
            "Ziyaretçi bilgi talepleri: e-postayla doğrulanmayanlar 30 gün sonra silinir; doğrulanıp firmaya iletilenler ticari yazışma olarak saklanır; talebin gönderildiği IP adresi 30 gün sonra silinir. Davet edilen, Rothern üyesi olmayan firmaların iletişim bilgileri: 1 yıl; davetin ilgili olduğu talep teklif toplamayı sürdürdükçe silinmez, talep kapandıktan sonra 1 yıl dolunca silinir.",
            "Kayıt formundan açılıp e-posta adresi 7 gün içinde doğrulanmayan üyelik kayıtları, firma kaydıyla birlikte kendiliğinden silinir. Firma profili ve ürün görüntülenme kayıtları 180 gün sonra silinir.",
            "Uygulama içi bildirimler: 1 yıl. Kullanılmayan şifre sıfırlama bağlantıları ve doğrulama kodları: 30 gün. Kabul edilmeyen ekip davetleri: 1 yıl. E-posta aboneliğinden çıkma kayıtları (yalnız adres ve kapsam): ret iradenize uyabilmek için süresiz.",
            "İlgili kişi başvuruları ve destek yazışmaları: sonuçlandırılmasından itibaren 3 yıl.",
            "Sistem yedekleri: yedekleme döngüsü içinde üzerine yazılarak silinir.",
          ],
          links: [{ href: "/sozlesmeler/saklama-imha", label: "Kişisel Veri Saklama ve İmha Politikası" }],
        },
        {
          paragraphs: [
            "Hesabınızı sildiğinizde giriş bilgileriniz silinir; adınız, soyadınız, telefon numaranız ve e-posta adresiniz hesap kaydından hemen kaldırılır. Firma kaydındaki bilgiler (şahıs firmalarında T.C. kimlik numarası, firma yetkilisinin kimlik numarası ve kimlik belgesi görüntüleri, işyeri adresi, firmanın fatura e-posta adresi ve telefonu) firmayla birlikte kalır; firmanın kapanmasında Gizlilik Politikası'nın \"Hesabınızı Silme\" maddesindeki kurala tabidir. Firmanıza ait ticari kayıtlar (talep, teklif, sipariş, onay, mesaj ve belgeler; mesajlarda gönderen adı dahil), denetim kayıtları (işlem anındaki e-posta adresinizle birlikte), e-posta gönderim kayıtları ve e-posta abonelikten çıkma kayıtları yukarıdaki süreler boyunca, sözleşme onay tarihleriniz ise ispat amacıyla bu ticari kayıtlar saklandığı sürece saklanmaya devam eder; diğer kullanıcılara daha önce gönderilmiş bildirim ve e-postalarda adınız geçebilir.",
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
            `Haklarınıza ilişkin taleplerinizi, Veri Sorumlusuna Başvuru Usul ve Esasları Hakkında Tebliğ'e uygun olarak yazılı biçimde ${OPERATOR.address} adresine elden ya da posta yoluyla; güvenli elektronik imza ya da mobil imzayla imzalayarak veya Rothern'e daha önce bildirdiğiniz ve sistemimizde kayıtlı olan e-posta adresinizden ${OPERATOR.kvkkEmail} adresine e-postayla iletebilirsiniz. Başvurunuzda adınız, soyadınız, (Türk vatandaşları için) T.C. kimlik numaranız, tebligata esas adresiniz ya da e-posta adresiniz ve talep konunuz yer almalıdır. Başvurularınız en geç 30 gün içinde ücretsiz olarak sonuçlandırılır; işlemin ayrıca bir maliyet gerektirmesi hâlinde Kişisel Verileri Koruma Kurulu tarafından belirlenen tarifedeki ücret alınabilir. Başvurunuz reddedilirse, cevabı yetersiz bulursanız ya da süresinde cevap verilmezse, KVKK m. 14 uyarınca Kişisel Verileri Koruma Kurulu'na şikâyette bulunabilirsiniz.`,
            "Hesabınızın silinmesini, yazılı başvuru yapmanıza gerek kalmadan uygulama içinden de sağlayabilirsiniz: Rothern mobil uygulamasında ya da www.rothern.com'da giriş yaptıktan sonra Ayarlar › Hesap Bilgileri › Hesabı sil adımlarıyla (şirket bilgileri henüz tamamlanmadıysa ya da sözleşme onayı penceresi açıksa o ekrandaki \"Hesabımı sil\" düğmesiyle) hesabınızı kendiniz silebilirsiniz; silme hemen gerçekleşir. Silmeyle kaldırılan ve yasal nedenlerle saklanan bilgiler ile firma Kurucusu ve firmanın tek kullanıcısı için geçerli özel durumlar, Gizlilik Politikası'nın \"Hesabınızı Silme\" maddesinde ve hesap silme sayfasında açıklanır. Hesabınıza giriş yapamıyorsanız ya da bu koşulları yerine getiremiyorsanız silme talebinizi yukarıdaki adrese iletebilirsiniz.",
            "Açık rızaya dayanan işleme faaliyetine (Rothern'in kampanya ve tanıtımlarına ilişkin ticari elektronik ileti) ilişkin rızanızı dilediğiniz zaman yukarıdaki adrese bildirerek ya da iletideki ret bağlantısıyla geri alabilirsiniz; geri alma, o tarihe kadar rızaya dayanılarak yapılan işlemleri etkilemez ve Platform'u kullanmanızı engellemez. E-posta bildirimlerini Ayarlar › Bildirim Tercihleri sayfasından ya da bildirim e-postalarının altındaki abonelikten çıkma bağlantısıyla, mobil uygulamanın anlık bildirimlerini cihazınızın ayarlarından kapatabilirsiniz. Hesabınızı sildiğinizde ticari elektronik ileti onayınız da geri alınır.",
            "Platform, işbu Aydınlatma Metni'ni mevzuat ve hizmet kapsamındaki değişikliklere bağlı olarak güncelleyebilir; güncel metin her zaman bu sayfada yayımlanır.",
          ],
          links: [
            { href: "/hesap-silme", label: "Hesap silme sayfası" },
            { href: "/sozlesmeler/gizlilik#madde-6", label: "Gizlilik Politikası — Hesabınızı Silme" },
            { href: "/sozlesmeler/saklama-imha", label: "Kişisel Veri Saklama ve İmha Politikası" },
          ],
        },
      ]}
    />
  );
}
