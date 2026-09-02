import { LegalDoc } from "@/components/marketing/legal-doc";
import { OPERATOR } from "@/lib/company-info";

export const metadata = { title: "Aracılık ve Kullanım Sözleşmesi — Rothern" };

export default function Page() {
  return (
    <LegalDoc
      title="Platform Aracılık ve Kullanım Sözleşmesi"
      updatedAt="2 Eylül 2026"
      sections={[
        {
          heading: "1. Konu ve Platformun Rolü",
          paragraphs: [
            `İşbu Sözleşme; Rothern platformunun işletmecisi ${OPERATOR.legalName}'nin ("Platform"), alıcı ve satıcı firmalar arasında satın alma talebi (RFQ), teklif toplama, açık eksiltme/artırma, kazandırma ve sipariş süreçlerine elektronik ortamda aracılık etmesinin koşullarını düzenler.`,
            "Platform yalnızca aracıdır: taraflar arasında kurulan alım-satım ilişkisinin tarafı, temsilcisi, komisyoncusu veya garantörü değildir. Malın/hizmetin mevzuata ve satın alma talebi şartlarına uygunluğu, ayıptan sorumluluk, teslimat, fatura ve ödeme yükümlülükleri münhasıran alıcı ile satıcı arasındadır.",
          ],
        },
        {
          heading: "2. Satın Alma Talebi Süreci",
          paragraphs: [
            "Satın Alma Talebini açan firma; satın alma talebi şartlarını, kalemleri, teslimat ve ödeme koşullarını doğru ve eksiksiz belirlemekle yükümlüdür. Yayımlanan satın alma talebi, belirlenen kapanış tarihine kadar tekliflere açıktır; satın alma talebi sahibi mevzuata uygun olmak kaydıyla satın alma talebini kalıcı olarak kapatabilir veya iptal edebilir.",
            "Görünürlük üç kademelidir: davetli (kapalı) satın alma taleplerini yalnızca davet edilen firmalar; bağlantılara açık olanları yalnızca ilan sahibiyle bağlantısı bulunan firmalar görür.",
            "Herkese açık olarak yayımlanan satın alma talepleri ve satış ilanları, Platform'un giriş gerektirmeyen sayfalarında (pazar yeri) yayımlanabilir ve arama motorlarınca dizinlenebilir. Bu sayfalarda ilanın numarası, başlığı, açıklaması, kategorisi, kalemleri, miktar ve birimleri, teslimat/ödeme koşulları, son teklif tarihi ile ilanı açan firmanın adı ve konumu görüntülenebilir.",
            "Teklifler bu kapsamın DIŞINDADIR: teklif içerikleri, teklif veren firmaların kimlikleri ve teklif sayısı herkese açık sayfalarda hiçbir koşulda yayımlanmaz (madde 3).",
            "Firma, herkese açık yayımı üç noktadan geri alabilir: ilanın görünürlüğünü \"bağlantılar\" veya \"davetli\" olarak değiştirerek, ilan bazında arama motoru dizinlemesini kapatarak ya da firma ayarlarından tüm ilanlarının pazar yerinde görünmesini durdurarak. Yayımdan kaldırılan bir sayfanın arama motoru sonuçlarından ne zaman düşeceği ilgili arama motorunun tarama sıklığına bağlıdır ve Platform'un denetiminde değildir.",
          ],
        },
        {
          heading: "3. Kapalı Zarf Esası",
          paragraphs: [
            "Aksi satın alma talebi tipinde açıkça öngörülmedikçe teklifler kapalı zarf esasıyla toplanır: teklif verenler birbirlerinin tekliflerini, kimliklerini ve teklif sayısını göremez; teklifleri yalnızca satın alma talebi sahibi görür. Açık eksiltme/artırma (pazarlık) tipi satın alma taleplerinde görünürlük, satın alma talebi sahibinin seçtiği ve satın alma talebinde ilan edilen görünürlük moduna tabidir.",
          ],
        },
        {
          heading: "4. Tekliflerin Bağlayıcılığı",
          paragraphs: [
            "Gönderilen teklif, teklif geçerlilik süresi boyunca teklif vereni bağlar; teklif gönderildikten sonra tek taraflı olarak değiştirilemez veya geri çekilemez. Teklifte düzeltme ihtiyacı doğarsa teklif veren, satın alma talebi sahibiyle platform üzerinden iletişime geçer; satın alma talebi sahibinin mevcut teklifi elemesi hâlinde yeni teklif verilebilir.",
            "Satın Alma Talebi sahibinin kazandırma kararını onaylamasıyla kazanan teklif esas alınarak sipariş kaydı oluşturulur. Kazandırma; satın alma talebinin tamamı için tek satıcıya veya kalem bazında birden çok satıcıya yapılabilir.",
          ],
        },
        {
          heading: "5. Sipariş ve İfa",
          paragraphs: [
            "Sipariş oluşturulmasıyla birlikte tarafların ifa yükümlülükleri (teslimat, belge ibrazı, ödeme) sipariş koşullarına ve aralarındaki ticari ilişkiye göre yürür. Platform, sipariş adımlarının takibi için araçlar sunar; ancak ifanın gerçekleşmesini garanti etmez ve taraflar arasındaki ödemelere aracılık etmez.",
          ],
        },
        {
          heading: "6. Tarafların Yükümlülükleri",
          list: [
            "Firma ve yetkili bilgilerinin doğru ve güncel tutulması; istenen doğrulama belgelerinin ibrazı,",
            "Satın Alma Talebi şartlarına, verilen tekliflere ve oluşturulan siparişlere uygun davranılması,",
            "Rekabeti bozucu anlaşma, danışıklı teklif, fiyat manipülasyonu ve benzeri uygulamalardan kaçınılması,",
            "Satın Alma Talebi süreçlerinde edinilen ticari bilgilerin (teklif içerikleri dâhil) amaç dışı kullanılmaması ve üçüncü kişilerle paylaşılmaması,",
            "Platform dışına yönlendirme yoluyla süreç bütünlüğünü bozan davranışlardan kaçınılması.",
          ],
        },
        {
          heading: "7. Ücretlendirme",
          paragraphs: [
            "Platformun temel kullanım ve üyelik paketleri (paket kapsamları, süreleri ve ücretleri) Platform üzerinde ilan edilir. Ücretli pakete geçiş, ilgili paketin satın alınmasıyla yürürlüğe girer. Platform, paket kapsam ve ücretlerinde değişiklik yapma hakkını saklı tutar; değişiklikler mevcut ödenmiş dönemi etkilemez.",
            "Platform, alıcı ile satıcı arasındaki mal/hizmet bedeli üzerinden taraflar arası ödemeye aracılık etmez; mal/hizmet bedelinin ödenmesi tarafların kendi aralarında gerçekleşir.",
          ],
        },
        {
          heading: "8. Kayıtlar ve Denetim İzi",
          paragraphs: [
            "Satın Alma Talebi, teklif, kazandırma, sipariş ve mesajlaşma süreçlerine ilişkin işlem kayıtları ile denetim izleri Platform tarafından tutulur. Bu kayıtlar, taraflar arasındaki uyuşmazlıklarda HMK m. 193 anlamında delil teşkil eder.",
          ],
        },
        {
          heading: "9. Sorumluluğun Reddi",
          paragraphs: [
            "Platform; kullanıcıların beyan ettiği bilgi ve belgelerin doğruluğunu, satın alma talebi konusu mal/hizmetin niteliğini, satıcının ifa kabiliyetini veya alıcının ödeme gücünü garanti etmez. Taraflar, sözleşme kuracakları karşı taraf hakkında kendi ticari değerlendirmelerini yapmakla yükümlüdür.",
            "Kast ve ağır ihmal hâlleri saklı kalmak üzere Platform, taraflar arasındaki alım-satım ilişkisinden doğan zararlardan sorumlu tutulamaz.",
          ],
        },
        {
          heading: "10. İhlal ve Yaptırımlar",
          paragraphs: [
            "İşbu Sözleşme'ye aykırılık hâlinde Platform; ilgili satın alma talebi veya teklifi kaldırma, hesabı askıya alma veya üyeliği sona erdirme yetkisine sahiptir. Mevzuata aykırılık şüphesi taşıyan durumlar yetkili mercilere bildirilebilir.",
          ],
        },
        {
          heading: "11. Yürürlük",
          paragraphs: [
            "İşbu Sözleşme, kayıt sırasında elektronik ortamda kabul edilmesiyle yürürlüğe girer ve üyelik süresince geçerlidir. Kullanıcı Sözleşmesi'nin değişiklik, fesih, uygulanacak hukuk ve yetki hükümleri işbu Sözleşme için de geçerlidir.",
          ],
        },
      ]}
    />
  );
}
