import { LegalDoc } from "@/components/marketing/legal-doc";

export const metadata = { title: "Kullanıcı Sözleşmesi — Rothern" };

export default function Page() {
  return (
    <LegalDoc
      title="Kullanıcı Sözleşmesi"
      updatedAt="26 Temmuz 2026"
      sections={[
        {
          heading: "1. Taraflar ve Konu",
          paragraphs: [
            "İşbu Kullanıcı Sözleşmesi (\"Sözleşme\"), Rothern (\"Platform\") ile www.rothern.com üzerinde hesap oluşturan gerçek veya tüzel kişi (\"Kullanıcı\") arasında, hesabın elektronik ortamda onaylandığı anda kurulmuş ve yürürlüğe girmiş sayılır.",
            "Sözleşme'nin konusu; Kullanıcı'nın Platform'da sunulan B2B e-tedarik ve e-ihale hizmetlerinden yararlanmasına ilişkin tarafların hak ve yükümlülüklerinin belirlenmesidir. Platform üzerinden yürütülen alım-satım süreçlerine ilişkin özel hükümler, ayrıca kabul edilen Platform Aracılık ve Kullanım Sözleşmesi'nde düzenlenir.",
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
            "Gerçeğe aykırı, yanıltıcı veya üçüncü kişilerin haklarını ihlal eden içerik, ilan, teklif veya belge yüklemek,",
            "İhale ve teklif süreçlerini manipüle etmek (danışıklı teklif, fiyat anlaşması, sahte hesapla teklif dâhil),",
            "Platform'un altyapısına zarar verecek, işleyişini bozacak veya güvenlik önlemlerini aşmaya yönelik girişimlerde bulunmak,",
            "Diğer kullanıcıların verilerini hukuka aykırı şekilde toplamak, kopyalamak veya üçüncü kişilerle paylaşmak,",
            "Platform'u yürürlükteki mevzuata, dürüstlük kuralına veya işbu Sözleşme'ye aykırı herhangi bir amaçla kullanmak.",
          ],
        },
        {
          heading: "6. İçerik ve Fikri Mülkiyet",
          paragraphs: [
            "Platform'un yazılımı, tasarımı, markası ve tüm bileşenleri üzerindeki fikri ve sınai mülkiyet hakları Rothern'e aittir; Kullanıcı'ya yalnızca hizmetten yararlanma amacıyla sınırlı, devredilemez bir kullanım hakkı tanınır.",
            "Kullanıcı'nın Platform'a yüklediği içeriklerin (ilan, belge, görsel, mesaj) hukuka uygunluğundan Kullanıcı sorumludur. Kullanıcı, bu içeriklerin hizmetin sunulması amacıyla Platform tarafından barındırılmasına ve işlenmesine izin verir.",
          ],
        },
        {
          heading: "7. Hizmetin Kapsamı ve Değişiklikler",
          paragraphs: [
            "Platform, hizmetin kapsamını, özelliklerini ve ücretsiz/ücretli paket içeriklerini değiştirme, geliştirme veya sonlandırma hakkını saklı tutar; Kullanıcı aleyhine esaslı değişiklikler makul süre önceden duyurulur.",
            "Platform'da yer alan yapay zekâ destekli özellikler (belgeden form doldurma, kategori önerisi, asistan) yalnızca yardımcı niteliktedir; üretilen çıktıların doğruluğunun kontrolü ve nihai karar Kullanıcı'ya aittir.",
          ],
        },
        {
          heading: "8. Askıya Alma ve Fesih",
          paragraphs: [
            "Platform; işbu Sözleşme'ye, Aracılık Sözleşmesi'ne veya mevzuata aykırılık hâlinde Kullanıcı hesabını geçici olarak askıya alabilir veya Sözleşme'yi haklı nedenle feshedebilir. Kullanıcı, hesabını dilediği zaman kapatabilir; devam eden ihale, teklif veya sipariş süreçlerinden doğan yükümlülükler hesabın kapatılmasından etkilenmez.",
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
            "İşbu Sözleşme Türkiye Cumhuriyeti hukukuna tabidir. Sözleşme'den doğan uyuşmazlıklarda Platform kayıtları (veritabanı, log ve denetim kayıtları dâhil) HMK m. 193 anlamında delil teşkil eder; uyuşmazlıkların çözümünde Rothern'in merkezinin bulunduğu yer mahkemeleri ve icra daireleri yetkilidir.",
            "Sorular ve bildirimler için: destek@rothern.com",
          ],
        },
      ]}
    />
  );
}
