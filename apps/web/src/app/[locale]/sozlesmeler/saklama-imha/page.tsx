import { getTranslations, setRequestLocale } from "next-intl/server";
import { localeFromParams, type LocaleParams } from "@/i18n/params";
import type { Metadata } from "next";
import { LegalDoc } from "@/components/marketing/legal-doc";
import { LEGAL_DOC_LOCALES, buildMetadata } from "@/lib/seo/meta";
import { OPERATOR } from "@/lib/company-info";

/*
 * KİŞİSEL VERİ SAKLAMA VE İMHA POLİTİKASI (2026-10-16, kullanıcı kararı).
 *
 * İçerik Silme Yönetmeliği m.6/1 (a)-(h) sırasıyla. SAKLAMA TABLOSU (madde 8)
 * TEK KAYNAKTIR: KVKK Aydınlatma Metni m.7, Gizlilik m.6, `/hesap-silme` ve
 * Kullanıcı Sözleşmesi m.8 buradaki süreleri özetler; API'deki saklama işleri
 * (zamanlanmış imha işleri, `AccountDeletionService`, kapanan firma
 * hatırlatıcısı) bu tabloyu uygular. Bir süre değişirse tablo, işler ve özet
 * metinler BİRLİKTE değişir; kişisel veri taşıyan yeni tablo buraya satır
 * almadan eklenmez (CLAUDE.md "KVKK saklama ve imha").
 *
 * "Anonim" denmez (inceleme 2026-10-16): hesap kaydı da kapanan firmanın
 * firma kaydı da ticari kayıtlara bağlı kaldığı için takma adlıdır — kişisel
 * veriler SİLİNİR, kayıt "Silinmiş Kullanıcı" / "Silinmiş Firma" adıyla kalır.
 * Anonim hâle getirme yalnız gerçekten geri döndürülemeyen sonuç için (madde 6).
 *
 * Tablo satır numaraları API'deki `retention-policy.ts` yorumlarında ve web
 * `legal-retention-policy.test`te geçer: satır SONA eklenir, araya girmez.
 */
export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const locale = await localeFromParams(params);
  const t = await getTranslations({ locale, namespace: "web.marketing.legal.saklamaImha" });
  return buildMetadata({
    locale,
    // Hukuki metin yalnız Türkçe: EN/RU sayfanın kanoniği Türkçe adres.
    locales: LEGAL_DOC_LOCALES,
    title: t("metaTitle"),
    description: t("metaDesc"),
    path: "/sozlesmeler/saklama-imha",
  });
}

const RETENTION_COLUMNS = ["Kişisel veri / kayıt", "Saklama süresi", "Saklama sebebi", "Süre sonunda imha"];

/** Silme Yönetmeliği m.6/1-g: saklama ve imha sürelerini gösteren tablo. */
const RETENTION_ROWS: string[][] = [
  [
    "1. Hesap verileri: ad, soyad, e-posta adresi, telefon numarası, şifre (kimlik doğrulama sistemindeki giriş kaydı), oturumlar, mobil bildirim cihaz kaydı, iki adımlı doğrulama bilgileri ve bildirim tercihleri",
    "Üyelik süresince; hesap silindiğinde hemen; kullanıcı ekipten çıkarıldığında hemen",
    "KVKK m. 5/2-c (üyelik sözleşmesinin kurulması ve ifası); süre sonunda KVKK m. 7",
    "Hesap silme işlemiyle anında silme. Hesap kaydı, bağlı ticari kayıtların bütünlüğü için kişisel alanları silinmiş olarak \"Silinmiş Kullanıcı\" adıyla ve sözleşme onay tarihleriyle, bu kayıtlar saklandığı sürece kalır. Ekipten çıkarılan kullanıcıda giriş kaydı, e-posta adresi, telefon numarası, iki adımlı doğrulama bilgileri, bildirim tercihleri, bildirimler ve yapay zekâ asistanı sohbetleri çıkarıldığı anda silinir; adı, firmanın kayıtlarında işlemi yapanın görünmesi için firma kaydıyla birlikte kalır (2. satır); kullanıcının firmadaki yetki bilgisi de hesap kaydında kalır.",
  ],
  [
    "2. Firma kayıtları: unvan, vergi numarası (şahıs firmalarında T.C. kimlik numarası), adresler, banka hesap bilgileri, firma doğrulama belgeleri, firma yetkilisinin kimlik numarası ve kimlik belgesi görüntüleri",
    "Firma hesabı açık olduğu sürece; firma kapandıktan (firmanın son kullanıcısı hesabını sildikten) sonra en geç 30 gün",
    "KVKK m. 5/2-c (sözleşmenin ifası, firma doğrulaması), m. 5/2-f (Platform'da güvenli ticaret)",
    "Yönetici işlemiyle silme: firma kaydındaki kişisel veriler (unvan, vergi ve kimlik numarası, adresler, banka bilgileri, belgeler) ve firma kullanıcılarının adları silinir; geçmiş ticari kayıtları olan firmanın kaydı yalnız \"Silinmiş Firma\" adıyla kalır. Firma doğrulama belgeleri, kimlik belgesi görüntüleri, logo ve kapak görselleri dosya depolama alanından silinir.",
  ],
  [
    "3. Ticari kayıtlar ve ticari yazışmalar: satın alma talepleri, teklifler, siparişler, ödeme bildirimleri, değerlendirmeler, firmalar arası mesajlar ve yüklenen belgeler; ticari işlemlere ilişkin e-postaların (talep, teklif, sipariş, mesaj, bilgi talebi, bağlantı ve üyelik bildirimleri) gönderim ve teslim kayıtları (alıcı, konu, içerik verisi, teslim durumu)",
    "Kaydın oluştuğu takvim yılının sonundan itibaren 10 yıl",
    "KVKK m. 5/2-e (6098 sayılı Türk Borçlar Kanunu m. 146: 10 yıllık zamanaşımı boyunca olası uyuşmazlıklarda ispat) ve m. 5/2-c (Platform'u kullanan firmaların 6102 sayılı Türk Ticaret Kanunu m. 82 ve 213 sayılı Vergi Usul Kanunu m. 253 uyarınca saklamakla yükümlü oldukları kayıt ve yazışmalarına erişimin sürdürülmesi); Rothern'in taraf olduğu ticari yazışmalar ve kendi defter ve belgeleri için m. 5/2-ç (TTK m. 82, VUK m. 253)",
    "Periyodik imhada silme. E-posta gönderim ve teslim kayıtları otomatik olarak silinir; alıcının istenmeyen ileti (spam) şikâyetini taşıyan kayıt, şikâyete uyulabilmesi için yalnız adres, durum ve tarihlerden oluşan ret kaydına indirgenir (14. satır). Ticari işlem dışındaki e-postaların kayıtları 21. satıra tabidir.",
  ],
  [
    "4. Denetim kayıtları: Platform'da yapılan işlemlerin kaydı (işlemi yapan, işlem anındaki e-posta adresi, işlem zamanı), IP adresi ve tarayıcı bilgisi",
    "Oluşturulmasından itibaren 10 yıl; kayıttaki IP adresi ve tarayıcı bilgisi en fazla 2 yıl",
    "KVKK m. 5/2-e (TBK m. 146), m. 5/2-f; IP adresi için 5651 sayılı Kanun m. 5/3 (en fazla 2 yıl)",
    "IP adresi ve tarayıcı bilgisi 2 yıllık üst sınır dolmadan otomatik silinir; kayıt 10 yıl dolunca otomatik silinir.",
  ],
  [
    "5. Erişim (trafik) kayıtları: sunucu ve içerik dağıtım ağı (CDN) erişim günlükleri — IP adresi, erişim zamanı, istenen adres ve hizmet türü",
    "En fazla 2 yıl (5651 sayılı Kanun m. 5/3)",
    "5651 sayılı Kanun m. 5/3; KVKK m. 5/2-ç",
    "Günlüklerin tutulduğu hizmet sağlayıcı sisteminde, hesap ayarlarıyla belirlenen süre sonunda otomatik silme",
  ],
  [
    "6. Yapay zekâ kullanım kayıtları: kullanılan özellik, kullanım zamanı ve maliyeti, kullanıcı kimliği ve e-posta adresi",
    "Kaydın oluştuğu takvim yılının sonundan itibaren 5 yıl; kayıttaki e-posta adresi oluşturulmasından itibaren 1 yıl",
    "KVKK m. 5/2-f (yapay zekâ maliyetinin ve kullanım sınırlarının denetimi)",
    "E-posta adresi 1 yıl dolunca, kayıt 5 yıl dolunca otomatik silinir.",
  ],
  ["7. Yapay zekâ asistanı sohbetleri", "Son mesajdan itibaren 90 gün", "KVKK m. 5/2-c", "Otomatik silme"],
  [
    "8. Firma profili ve ürün görüntülenme kayıtları: görüntüleyen firma ve kullanıcı; giriş yapmamış ziyaretçide IP adresi ve tarayıcı bilgisinden her gün yeniden üretilen tek yönlü özet",
    "180 gün",
    "KVKK m. 5/2-f",
    "Otomatik silme",
  ],
  [
    "9. İptal edilmiş oturum kayıtları: çıkış yapılan oturumun kimliği",
    "Oturumun en uzun geçerlilik süresi dolana kadar",
    "KVKK m. 5/2-f (hesap güvenliği)",
    "Otomatik silme",
  ],
  [
    "10. Doğrulanmamış üyelik kayıtları: kayıt formundan açılıp e-posta adresi doğrulanmayan hesap ve firma kaydı",
    "7 gün",
    "KVKK m. 5/2-c",
    "Firma kaydı ve giriş kaydıyla birlikte otomatik silme",
  ],
  [
    "11. Şifre sıfırlama ve hesap kurma bağlantıları, e-postayla gönderilen doğrulama kodları",
    "Kullanılınca (kullanılan bağlantı, \"bu bağlantı kullanıldı\" bilgisini verebilmek için geçerlilik süresi dolana kadar); kullanılmayanlar oluşturulmalarından itibaren 30 gün",
    "KVKK m. 5/2-c, m. 5/2-f",
    "Doğrulama kodu kullanımda anında; diğerleri otomatik silme",
  ],
  [
    "12. Ziyaretçi bilgi talepleri: Rothern üyesi olmayan kişinin adı, e-posta adresi, telefon numarası, firma adı ve mesajı; talebin gönderildiği IP adresi (kötüye kullanım denetimi için)",
    "E-postayla doğrulanmayanlar oluşturulmalarından itibaren 30 gün; doğrulanıp firmaya iletilenler 3. satırdaki süre; IP adresi her talepte oluşturulmasından itibaren 30 gün",
    "KVKK m. 5/2-c (sözleşmenin kurulmasından önceki iletişim), m. 5/2-f (IP adresi: kötüye kullanımın önlenmesi)",
    "Doğrulanmayan talepte ve IP adresinde otomatik silme; firmaya iletilen talepte 3. satıra göre",
  ],
  [
    "13. Davet edilen üçüncü kişilerin iletişim bilgileri: Rothern üyesi olmayan firmalara gönderilen talep davetlerindeki e-posta adresi ve bu adresin bağlantı daveti kaydı (davet eden firma, adres, son tıklama, dil); yapay zekâ destekli tedarikçi aramasında bulunan firmaların adı, e-posta adresi ve web sitesi",
    "Davetten ya da aramadan itibaren 1 yıl; ilgili talep teklif toplamayı sürdürdükçe silinmez — talebin son değişikliğinden (kapanma, iptal, kazandırma) itibaren de 1 yıl beklenir. Bağlantı daveti kaydı, bağlı talep daveti kalmadığında ve son gönderim ya da tıklamadan itibaren 1 yıl dolunca silinir.",
    "KVKK m. 5/2-f",
    "Otomatik silme. Adres davet almak istemediğini bildirdiyse ret kaydı 14. satıra göre saklanır; gönderilen davet e-postasının gönderim kaydı 21. satıra tabidir.",
  ],
  [
    "14. E-posta ret kayıtları: abonelikten çıkma ve davet almak istememe kayıtları (yalnız e-posta adresi ve ret kapsamı); süresi dolan istenmeyen ileti şikâyetlerinin ret kaydı (yalnız adres, durum ve tarihler); yöneticinin kaldırdığı teslim engelinin kaydı (yalnız adres ve tarih)",
    "Süresiz; kayıtlı kullanıcı aynı bildirimi yeniden açarsa silinir",
    "KVKK m. 5/2-ç (6563 sayılı Kanun m. 8: ret bildirimine uyma yükümlülüğü), m. 5/2-f",
    "Ret iradesi sürdükçe saklanır; tercih yeniden açılınca silinir. Teslim engelinin kaldırıldığını gösteren kayıt, kaldırdığı şikâyet kaydından önce silinmez.",
  ],
  ["15. Uygulama içi bildirimler", "1 yıl", "KVKK m. 5/2-c", "Otomatik silme"],
  [
    "16. Gönderilmiş e-posta özeti öğeleri: akşam özetiyle gönderilen talep bildirimleri (alıcı adresi, ilgili talep)",
    "Gönderimden itibaren 90 gün; ilgili talep teklif toplamayı sürdürdükçe silinmez — talebin son değişikliğinden itibaren de 90 gün beklenir",
    "KVKK m. 5/2-f (aynı talebin aynı adrese yeniden bildirilmemesi)",
    "Otomatik silme",
  ],
  [
    "17. Sonuç vermeyen kategori aramaları: arama kutusuna yazılan metin",
    "Aynı metnin son aranmasından itibaren 1 yıl",
    "KVKK m. 5/2-f (kategori kataloğunun iyileştirilmesi)",
    "Otomatik silme",
  ],
  [
    "18. Yedekler: veritabanı yedekleri",
    "Yedekleme döngüsü süresince",
    "KVKK m. 12 (veri güvenliği), m. 5/2-f",
    "Yok etme: döngü içinde yeni yedekler yazıldıkça silinir",
  ],
  [
    "19. İmha kayıtları: her imha çalışmasının tarihi, kapsamı ve imha edilen kayıt sayısı",
    "10 yıl (denetim kaydı olarak)",
    "Yönetmelik m. 7/3 (en az 3 yıl); TBK m. 146",
    "4. satıra göre",
  ],
  [
    "20. Yapay zekâ ile belgeden doldurma için yüklenen geçici dosyalar (belge, görsel)",
    "Yüklemeden itibaren 24 saat",
    "KVKK m. 5/2-c",
    "Otomatik silme",
  ],
  [
    "21. Ticari işlem dışındaki e-postaların gönderim ve teslim kayıtları (alıcı, konu, içerik verisi, teslim durumu): (a) hesap güvenliği ve doğrulama e-postaları — şifre sıfırlama ve hesap kurma bağlantıları, giriş ve e-posta doğrulama kodları, iki adımlı doğrulama bildirimleri, ekip davetleri, ziyaretçi bilgi talebinin doğrulanması; (b) Rothern üyesi olmayan adreslere giden davetler; (c) öneri, eşleşme, özet ve duyuru e-postaları ile karşılama serisi",
    "(a) ve (b) gönderimden itibaren 1 yıl; (c) gönderimden itibaren 2 yıl",
    "KVKK m. 5/2-f (hesap güvenliği, teslim sorunlarının ve kötüye kullanımın incelenmesi, aynı iletinin yeniden gönderilmemesi)",
    "Otomatik silme; istenmeyen ileti şikâyetini taşıyan kayıt 3. satırdaki gibi ret kaydına indirgenir (14. satır)",
  ],
  [
    "22. Ekip davetleri: firmanın ekibine davet edilen kişinin e-posta adresi, verilen rol ve davetin durumu",
    "Kabul edilmeyen, iptal edilen ya da süresi dolan davet son değişikliğinden itibaren 1 yıl; kabul edilen davetteki adres hesap verisidir (1. satır)",
    "KVKK m. 5/2-c, m. 5/2-f",
    "Otomatik silme",
  ],
  [
    "23. Moderasyon kayıtları: firmalar arası şikâyetler ve engellemeler (şikâyet eden kullanıcı, gerekçe ve açıklama), yöneticinin firma hakkındaki notları",
    "İlgili firma hesabı açık olduğu sürece; firma kapandıktan sonra olası uyuşmazlıklarda ispat için 10 yıl",
    "KVKK m. 5/2-e (TBK m. 146), m. 5/2-f (Platform güvenliği)",
    "En geç 6 ayda bir yapılan gözden geçirmede elle silme",
  ],
  [
    "24. Platform personeli hesapları: yönetim paneli kullanıcılarının adı, soyadı, e-posta adresi, rolü, iki adımlı doğrulama bilgileri ve son giriş zamanı",
    "Görev süresince; görevden ayrılışta hesap kapatılır ve en geç bir sonraki gözden geçirmede silinir (yapılan işlemler denetim kayıtlarında, işlemi yapanın e-posta adresiyle 4. satıra göre kalır)",
    "KVKK m. 5/2-c (iş ilişkisinin yürütülmesi), m. 5/2-f (yönetim paneli güvenliği)",
    "En geç 6 ayda bir yapılan gözden geçirmede elle silme",
  ],
  [
    "25. Kurumsal e-posta kutularındaki yazışmalar: ilgili kişi başvuruları ve yanıtları (başvuruda verilen kimlik ve iletişim bilgileri dahil), destek yazışmaları",
    "Başvurunun ya da yazışmanın sonuçlandırılmasından itibaren 3 yıl; Rothern'in ticari işlerine ilişkin yazışmalar 3. satırdaki süre",
    "KVKK m. 5/2-e (başvurunun ve yanıtının ispatı), m. 5/2-ç (TTK m. 82: Rothern'in ticari yazışmaları)",
    "En geç 6 ayda bir yapılan gözden geçirmede elle silme",
  ],
];

export default async function Page({ params }: { params: LocaleParams }) {
  setRequestLocale(await localeFromParams(params));
  return (
    <LegalDoc
      path="/sozlesmeler/saklama-imha"
      title="Kişisel Veri Saklama ve İmha Politikası"
      updatedAt="2026-10-23"
      sections={[
        {
          paragraphs: [
            `İşbu Kişisel Veri Saklama ve İmha Politikası ("Politika"), veri sorumlusu sıfatıyla ${OPERATOR.legalName} ("Rothern") tarafından işletilen Rothern platformunda (www.rothern.com web sitesi ile Rothern mobil uygulamaları; "Platform") işlenen kişisel verilerin ne kadar süre saklanacağını ve süre sonunda nasıl imha edileceğini belirler. Politika, 6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") m. 7 ile Kişisel Verilerin Silinmesi, Yok Edilmesi veya Anonim Hale Getirilmesi Hakkında Yönetmelik ("Yönetmelik") uyarınca hazırlanmıştır ve Veri Sorumluları Siciline kayıt yükümlülüğünden bağımsız olarak uygulanır. Veri sorumlusunun adresi: ${OPERATOR.address}.`,
            "Kişisel verilerin hangi amaçlarla ve hangi hukuki sebeplere dayanılarak işlendiği, kimlere aktarıldığı ve ilgili kişilerin hakları KVKK Aydınlatma Metni'nde açıklanır; bu Politika onu tamamlar.",
          ],
        },
        {
          heading: "1. Amaç",
          paragraphs: [
            "Bu Politika'nın amacı; kişisel verilerin yalnız işlendikleri amaç için gerekli olan ve ilgili mevzuatta öngörülen süre kadar saklanmasını (KVKK m. 4/2-d), işleme şartlarının tamamı ortadan kalktığında re'sen ya da ilgili kişinin talebi üzerine silinmesini, yok edilmesini veya anonim hâle getirilmesini (KVKK m. 7) ve bu işlemlerin kayıt altına alınmasını sağlamaktır.",
          ],
        },
        {
          heading: "2. Kapsam ve Kayıt Ortamları",
          paragraphs: [
            "Politika, Platform kapsamında işlenen kişisel verileri kapsar: Platform üyeleri (firma yetkilileri ve çalışanları), Platform'u ziyaret eden ve bilgi talebi gönderen kişiler, Platform üyelerinin satın alma talepleri için davet edilen, Rothern üyesi olmayan firmaların çalışanları, Rothern'e başvuran ya da yazışan kişiler ve Platform personeli (yönetim paneli kullanıcıları). Kişisel veriler aşağıdaki elektronik kayıt ortamlarında tutulur:",
          ],
          list: [
            "Platform veritabanı (hesap, firma, işlem, bildirim, denetim ve e-posta gönderim kayıtları),",
            "Dosya depolama alanı (firma doğrulama belgeleri ve kimlik belgesi görüntüleri, talep ve teklif belgeleri, logo ve ürün görselleri, yapay zekâ ile işlenmek üzere yüklenen geçici dosyalar),",
            "Kimlik doğrulama sistemi (giriş bilgileri),",
            "Sunucu ve içerik dağıtım ağı (CDN) erişim günlükleri,",
            "Hata izleme kayıtları,",
            "Kurumsal e-posta kutuları (ilgili kişi başvuruları ve destek yazışmaları),",
            "Veritabanı yedekleri.",
          ],
        },
        {
          paragraphs: [
            "Bu ortamlar, KVKK Aydınlatma Metni'nin 4. maddesinde unvanı ve ülkesiyle sayılan hizmet sağlayıcılar (veri işleyenler) tarafından Rothern adına ve Rothern'in talimatlarıyla işletilir. Platform hizmeti kapsamında kişisel veriler fiziki (kâğıt) ortamda tutulmaz; ilgili kişi başvuruları gibi fiziki ortamda oluşabilecek belgeler de bu Politika'daki sürelere ve imha kurallarına tabidir.",
          ],
        },
        {
          heading: "3. Tanımlar",
          list: [
            "Anonim hâle getirme: Kişisel verilerin, başka verilerle eşleştirilerek dahi hiçbir surette kimliği belirli veya belirlenebilir bir gerçek kişiyle ilişkilendirilemeyecek hâle getirilmesi.",
            "İlgili kişi: Kişisel verisi işlenen gerçek kişi.",
            "İmha: Kişisel verilerin silinmesi, yok edilmesi veya anonim hâle getirilmesi.",
            "Kayıt ortamı: Tamamen veya kısmen otomatik olan ya da herhangi bir veri kayıt sisteminin parçası olmak kaydıyla otomatik olmayan yollarla işlenen kişisel verilerin bulunduğu her türlü ortam.",
            "Kişisel verilerin silinmesi: Kişisel verilerin ilgili kullanıcılar için hiçbir şekilde erişilemez ve tekrar kullanılamaz hâle getirilmesi.",
            "Kişisel verilerin yok edilmesi: Kişisel verilerin hiç kimse tarafından hiçbir şekilde erişilemez, geri getirilemez ve tekrar kullanılamaz hâle getirilmesi.",
            "Periyodik imha: Kişisel verilerin işlenme şartlarının tamamı ortadan kalktığında, bu Politika'da belirtilen ve tekrar eden aralıklarla re'sen yapılan silme, yok etme veya anonim hâle getirme işlemi.",
            "Saklama süresi: Kişisel verinin, işlendiği amaç ve ilgili mevzuat gereği saklandığı süre.",
            "Veri işleyen: Veri sorumlusunun verdiği yetkiye dayanarak onun adına kişisel verileri işleyen gerçek veya tüzel kişi.",
            "Veri sorumlusu: Kişisel verilerin işleme amaçlarını ve vasıtalarını belirleyen, veri kayıt sisteminin kurulmasından ve yönetilmesinden sorumlu olan kişi; bu Politika bakımından Rothern.",
          ],
        },
        {
          heading: "4. Saklamayı ve İmhayı Gerektiren Sebepler",
          paragraphs: [
            "Kişisel veriler, KVKK m. 5 ve m. 6'daki işleme şartlarından en az biri devam ettiği sürece saklanır. Saklamayı gerektiren başlıca sebepler şunlardır:",
          ],
          list: [
            "Rothern'in kanuni yükümlülükleri: Rothern'in kendi ticari defter ve belgelerinin, aldığı ticari mektupların ve gönderdiklerinin kopyalarının (ticari işe ilişkin e-postalar dahil) 10 yıl (6102 sayılı Türk Ticaret Kanunu m. 82), defter ve belgelerinin 5 yıl (213 sayılı Vergi Usul Kanunu m. 253) saklanması; yer sağlayıcının trafik bilgilerini en az 1, en fazla 2 yıl saklaması (5651 sayılı Kanun m. 5/3); ticari elektronik ileti almak istemeyen kişinin ret bildirimine uyulması (6563 sayılı Kanun m. 8) (KVKK m. 5/2-ç).",
            "Sözleşmenin kurulması ve ifası: üyelik sözleşmesinin ve Platform üzerinden yürütülen satın alma talebi, teklif ve sipariş süreçlerinin işletilmesi; Platform'u kullanan firmaların, TTK m. 82 ve VUK m. 253 uyarınca kendilerinin saklamakla yükümlü olduğu talep, teklif, sipariş ve yazışma kayıtlarına Platform üzerinden erişebilmesi (KVKK m. 5/2-c).",
            "Bir hakkın tesisi, kullanılması veya korunması: alacakların 10 yıllık genel zamanaşımı süresi (6098 sayılı Türk Borçlar Kanunu m. 146) boyunca olası uyuşmazlıklarda ispat (KVKK m. 5/2-e).",
            "Meşru menfaat ve veri güvenliği: Platform güvenliğinin sağlanması, kötüye kullanımın önlenmesi ve hataların giderilmesi (KVKK m. 5/2-f, m. 12).",
          ],
        },
        {
          paragraphs: [
            "Kişisel veriler; işlenmesine esas olan mevzuat hükmünün değiştirilmesi veya yürürlükten kaldırılması, sözleşmenin sona ermesi veya hiç kurulmaması, işleme amacının ortadan kalkması, açık rızaya dayanan işlemede rızanın geri alınması, ilgili kişinin KVKK m. 11 uyarınca yaptığı silme başvurusunun kabul edilmesi ya da saklama süresinin dolması ve verinin saklanmasını haklı kılacak başka bir şartın bulunmaması hâllerinde imha edilir (KVKK m. 7/1).",
          ],
        },
        {
          heading: "5. Güvenli Saklama İçin Teknik ve İdari Tedbirler",
          paragraphs: ["Kişisel verilerin güvenli saklanması ve hukuka aykırı erişimin önlenmesi için alınan başlıca teknik tedbirler:"],
          list: [
            "Platform'a ve yönetim paneline yapılan tüm bağlantılar TLS ile şifrelenir; veritabanı ve dosya depolama alanındaki veriler hizmet sağlayıcıların altyapısında şifrelenmiş olarak saklanır.",
            "Firma verileri, çok kiracılı yapıda firmaya göre ayrıştırılır; veritabanında satır düzeyinde erişim denetimi uygulanır.",
            "Şifreler yalnız tek yönlü özetleriyle (hash) saklanır; iki adımlı doğrulama sırları şifrelenir.",
            "Firma doğrulama belgeleri ve kimlik belgesi görüntüleri herkese kapalı depolama alanında tutulur ve yalnız yetkili kişiye, kısa süreli imzalı bağlantıyla açılır.",
            "Oturumlar istemci betiklerinin erişemediği (httpOnly) çerezlerle taşınır; değişiklik yapan isteklerde CSRF koruması ve istek hızı sınırlaması uygulanır.",
            "Yönetim paneline erişim rol bazlıdır ve en yetkili rolde iki adımlı doğrulama zorunludur; kritik işlemler denetim kaydına yazılır ve denetim kayıtları bu Politika'daki imha işlemleri dışında değiştirilmez.",
            "Hata izleme kayıtlarına gönderilen kişisel veriler en aza indirilir (çerezler, istek gövdesi, IP adresi ve bağlantılardaki jetonlar gönderilmeden ayıklanır); uygulama günlüklerine yalnız izin verilen istek bilgileri yazılır. Erişim (trafik) günlükleri IP adresi içerebilir ve 8. maddedeki tablonun 5. satırına göre saklanır.",
          ],
        },
        {
          paragraphs: ["Başlıca idari tedbirler:"],
          list: [
            "Kişisel verilere erişim yetkisi yalnız görevi gereği ihtiyaç duyan kişilere ve o ölçüde verilir; yetkiler görev değişikliğinde ve görevden ayrılışta kaldırılır.",
            "Veri işleyenlerle, verilerin yalnız Rothern'in talimatıyla ve hizmetin sunulması amacıyla işlenmesini öngören veri işleme sözleşmeleri (sağlayıcıların veri işleme ekleri) yapılır; yurt dışındaki veri işleyenlere aktarımda KVKK m. 9/4-c uyarınca Kişisel Verileri Koruma Kurulu'nun ilan ettiği standart sözleşme kullanılır (KVKK Aydınlatma Metni m. 4). Veri işleyenlerin tedbirleri, alt veri işleyenleri ve kendi kayıtlarını saklama süreleri yılda en az bir kez gözden geçirilir.",
            "Kişisel veri ihlali öğrenildiğinde Kişisel Verileri Koruma Kurulu'na en geç 72 saat içinde, etkilenen ilgili kişilere en kısa sürede bildirim yapılır (KVKK m. 12/5).",
          ],
        },
        {
          heading: "6. Hukuka Uygun İmha İçin Teknik ve İdari Tedbirler",
          paragraphs: ["Kişisel veriler, kayıt ortamına göre aşağıdaki yöntemlerle imha edilir:"],
          list: [
            "Silme: veritabanındaki kaydın ya da kaydın kişisel veri içeren alanlarının silinmesi; dosya depolama alanındaki belge ve görsellerin silinmesi; kimlik doğrulama sistemindeki giriş kaydının silinmesi. Silinen veri ilgili kullanıcılar için hiçbir şekilde erişilemez ve tekrar kullanılamaz hâle gelir.",
            "Anonim hâle getirme: kişisel verinin, başka verilerle eşleştirilerek dahi kimliği belirli veya belirlenebilir bir kişiyle ilişkilendirilemeyecek hâle getirilmesi; yalnız bu sonucun geri döndürülemez biçimde sağlandığı durumlarda (ör. kişisel veri içermeyen sayısal istatistik) uygulanır. Ticari kayıtlara bağlı kalan hesap ve firma kayıtları anonim sayılmaz: bunlarda kişisel veriler silinir, kayıt yalnız \"Silinmiş Kullanıcı\" ya da \"Silinmiş Firma\" adıyla kalır.",
            "Yok etme: veritabanı yedekleri, yedekleme döngüsü içinde yeni yedekler yazıldıkça kalıcı olarak silinir (üzerine yazma). Yedekten geri yükleme yapılırsa, yedeğin alınmasından sonra imha edilmiş veriler yeniden imha edilir.",
          ],
        },
        {
          paragraphs: [
            "Süreye bağlı imha, Platform'un zamanlanmış otomatik işleriyle yapılır: her iş, saklama süresi dolan kayıtları 8. maddedeki tabloya göre seçer ve imha eder. Otomatik olarak yapılmayan imha (kapanan firmanın firma kaydı, süresi dolan ticari kayıtlar, moderasyon kayıtları, Platform personeli hesapları ve kurumsal e-posta kutularındaki yazışmalar) yetkili yönetici tarafından yönetim panelinden ya da teknik ekip tarafından yapılır. Veri işleyenlerin hizmeti işletmek için kendi sistemlerinde tuttuğu kısa süreli teknik kayıtlar (ör. e-posta sağlayıcısının gönderim kayıtları, hata izleme olayları, barındırma sağlayıcılarının günlükleri) sağlayıcının sözleşmesi ve hesap ayarlarıyla belirlenen sürelerle sınırlıdır; bu süreler yılda en az bir kez gözden geçirilir. İlgili kişinin talebiyle silinen veri, gerekiyorsa veri işleyene de sildirilir.",
          ],
        },
        {
          heading: "7. Görev Dağılımı",
          paragraphs: [
            `Veri sorumlusu ${OPERATOR.legalName}'dir. Saklama ve imha süreçlerinde görev alanların unvanları, birimleri ve görevleri:`,
          ],
          table: {
            caption: "Saklama ve imha süreçlerinde görev dağılımı",
            columns: ["Unvan", "Birim", "Görev"],
            rows: [
              [
                "Şirket müdürü",
                "Yönetim",
                "Veri sorumlusu adına Politika'nın uygulanmasından sorumludur: Politika'yı yürürlüğe koyar ve günceller, gerekli kaynağı sağlar, periyodik gözden geçirmenin sonuçlarını onaylar, ilgili kişi başvurularını sonuçlandırır.",
              ],
              [
                "Teknik ekip",
                "Yazılım ve altyapı",
                "Otomatik saklama ve imha işlerini işletir ve izler, elle yapılan imha işlemlerini uygular, teknik tedbirleri, yedekleme ve günlük (log) saklama ayarlarını yönetir, imha kayıtlarını denetler.",
              ],
              [
                "KVKK irtibat adresi",
                OPERATOR.kvkkEmail,
                "İlgili kişi başvuruları ve bu Politika'ya ilişkin sorular bu adrese iletilir; başvurular şirket müdürüne ulaştırılır ve en geç 30 gün içinde sonuçlandırılır.",
              ],
            ],
          },
        },
        {
          heading: "8. Saklama ve İmha Süreleri",
          paragraphs: [
            "Aşağıdaki tablo, Platform'daki kişisel veri kategorilerinin saklama sürelerini, saklama sebeplerini ve süre sonunda uygulanan imha yöntemini gösterir. \"Kaydın oluştuğu takvim yılının sonundan itibaren\" yazılan sürelerde süre, kaydın oluştuğu yılın son gününden başlar; diğer süreler kaydın oluşturulmasından ya da tabloda belirtilen olaydan itibaren işler.",
          ],
          table: {
            caption: "Kişisel veri saklama ve imha süreleri",
            columns: RETENTION_COLUMNS,
            rows: RETENTION_ROWS,
          },
        },
        {
          heading: "9. Periyodik İmha Süresi",
          paragraphs: [
            "Süreye bağlı otomatik imha işleri her gün ya da her hafta çalışır; saklama süresi dolan kayıt, sürenin dolmasından sonraki ilk çalışmada (imha edilecek kayıt sayısı çoksa izleyen gecelerde) imha edilir. Otomatik olarak imha edilmeyen kayıtlar (tablodaki ticari kayıtlar, kapanan firmaların firma kayıtları, moderasyon kayıtları, Platform personeli hesapları ve kurumsal e-posta kutularındaki yazışmalar) en geç 6 ayda bir gözden geçirilir ve saklama süresi dolanlar, sürenin dolmasından sonraki ilk gözden geçirmede imha edilir (Yönetmelik m. 11). Kapanan firmanın firma kaydı, bu aralıktan bağımsız olarak kapanıştan itibaren en geç 30 gün içinde imha edilir.",
          ],
        },
        {
          heading: "10. İmha Kayıtları",
          paragraphs: [
            "Kayıt silen ya da güncelleyen her otomatik imha çalışması; çalışmanın tarihi, imha edilen kayıt türü ve sayısıyla birlikte denetim kaydına yazılır; hiçbir kaydın imha edilmediği çalışmalar, işin çalıştığını göstermek için günde bir kez kaydedilir. Yönetim panelinden yapılan imha işlemleri de işlemi yapan yöneticiyle birlikte denetim kaydına yazılır; elle yapılan diğer imha işlemleri gözden geçirme kaydına tarih, kapsam ve sayıyla yazılır. İmha kaydına imha edilen kişisel verinin kendisi yazılmaz. İmha kayıtları, Yönetmelik m. 7/3'teki en az 3 yıllık süreyi karşılayacak şekilde denetim kayıtlarıyla birlikte 10 yıl saklanır.",
          ],
        },
        {
          heading: "11. İlgili Kişinin Silme Talebi",
          paragraphs: [
            `İlgili kişi, KVKK m. 11 ve m. 13 uyarınca kişisel verilerinin silinmesini ${OPERATOR.kvkkEmail} adresine başvurarak isteyebilir; Platform üyeleri hesaplarını uygulama içinden kendileri de silebilir. İşleme şartlarının tamamı ortadan kalkmışsa talep konusu veriler silinir ve ilgili kişiye en geç 30 gün içinde bilgi verilir; veriler üçüncü kişilere aktarılmışsa bu kişilere de bildirilir ve gereğinin yapılması sağlanır. İşleme şartları ortadan kalkmamışsa (ör. kanuni saklama süresi devam eden ticari kayıtlar) talep, gerekçesi açıklanarak en geç 30 gün içinde yazılı veya elektronik ortamda reddedilebilir (Yönetmelik m. 12).`,
          ],
          links: [
            { href: "/hesap-silme", label: "Hesap silme: adımlar, silinen ve saklanan bilgiler" },
            { href: "/sozlesmeler/kvkk", label: "KVKK Aydınlatma Metni" },
          ],
        },
        {
          heading: "12. Yürürlük, Yayım ve Güncelleme",
          paragraphs: [
            "Politika, www.rothern.com'da yayımlandığı tarihte yürürlüğe girer. Politika; saklama süreleri, kayıt ortamları ya da mevzuat değiştiğinde ve her durumda yılda en az bir kez gözden geçirilir. Güncellemeler aşağıdaki değişiklik geçmişine tarihiyle yazılır ve güncel metin her zaman bu sayfada yayımlanır.",
          ],
          list: ["23.10.2026 — İlk yayım: saklama ve imha süreleri tablosu, periyodik imha süreleri, imha yöntemleri ve görev dağılımı."],
        },
      ]}
    />
  );
}
