/**
 * SIK SORULAN SORULAR — TEK KAYNAK (2026-09-09, Parça 4: GEO).
 *
 * Aynı dizi hem SAYFAYI hem `FAQPage` yapılandırılmış verisini besler. İkisi
 * ayrılsaydı yalnız şemada duran bir cevap kalırdı; bu hem arama motoru
 * yönergelerine aykırı (şema sayfada olmayanı söyleyemez) hem de kullanıcıya
 * faydasızdır.
 *
 * CEVAPLAR GERÇEK KURALLARI ANLATIR. Üretken motorlar (ChatGPT, Perplexity,
 * Gemini) bu sayfayı alıntılayacak; yanlış ya da "pazarlama dili" bir cevap
 * yanlış bilgiyi ölçekler. Fiyat RAKAMI bilerek yazılmıyor — paket fiyatları
 * kullanıcı kararı bekliyor, değişince burada bayat kalırdı; fiyat sayfasına
 * bağlanıyoruz.
 */
export interface Faq {
  q: string;
  a: string;
}

export const FAQ_GROUPS: { heading: string; items: Faq[] }[] = [
  {
    heading: "Platform",
    items: [
      {
        q: "Rothern nedir?",
        a: "Rothern, alıcı ve tedarikçi firmaları tek hesapta birleştiren Türkiye merkezli bir B2B tedarik pazar yeridir. Firmalar ürün vitrini yayımlar, satın alma talebi açar, kapalı zarf usulüyle teklif toplar ve kazanan teklifi siparişe dönüştürür. Aynı firma hesabı hem alıcı hem satıcı tarafında çalışır; iki ayrı hesap açmak gerekmez.",
      },
      {
        q: "Rothern alım satıma aracılık ediyor mu?",
        a: "Hayır. Rothern üzerinden satılan tek şey üyelik paketleridir. Firmalar arasındaki mal ve hizmet bedeline platform aracılık etmez, parayı taşımaz; ticaret taraflar arasında doğrudan yürür. Sipariş ekranındaki ödeme adımları tarafların birbirine yaptığı bildirimlerdir.",
      },
      {
        q: "Hangi ülkelerden kayıt alınıyor?",
        a: "Türkiye, KKTC, Rusya, Azerbaycan, Kazakistan, Özbekistan, Çin ve Birleşik Arap Emirlikleri. Her ülkenin kendi belge kümesi vardır; örneğin Çin'de 营业执照 (iş ruhsatı) sicil, vergi ve temsilci bilgisini tek belgede taşıdığı için ayrıca vergi belgesi istenmez.",
      },
    ],
  },
  {
    heading: "Teklif ve gizlilik",
    items: [
      {
        q: "Teklifler gizli mi?",
        a: "Evet, teklif toplama kapalı zarf usulüyle yapılır. Teklif verenler birbirinin teklifini asla göremez; teklif SAYISI da yayımlanmaz. Yalnız talebi açan firma kendisine gelen teklifleri görür. Gönderilmiş bir teklif düzenlenemez ve geri çekilemez — alıcı elerse tedarikçi yeni sürüm teklif verebilir.",
      },
      {
        q: "Alım talebini açan firmanın adı neden görünmüyor?",
        a: "Bir alım talebinde “kim alıyor” doğrudan rekabet istihbaratıdır: bir firmanın 40 ton çelik boru araması üretim planını açık eder. Bu yüzden herkese açık talep sayfalarında alıcının adı, logosu ve profil bağlantısı gösterilmez. Görünen bilgiler kimlik değil niteliktir: şehir, ülke, sektör, faaliyet tipi ve “Doğrulanmış alıcı” rozeti. Alıcının kimliği, teklif sürecinde karşı tarafa açılır.",
      },
      {
        q: "Bir talebe teklif vermek için ne gerekiyor?",
        a: "Sizi davet eden ya da bağlantınız olan bir firmanın talebine ücretsiz hesapla, belge doğrulaması olmadan teklif verebilirsiniz — alıcı sizi zaten tanıyor. Herkese açık bir talebe tanımadan teklif vermek içinse Silver paket ve firma doğrulaması gerekir; oraya sokan platform olduğu için kefil de platformdur.",
      },
    ],
  },
  {
    heading: "Ürünler ve fiyat",
    items: [
      {
        q: "Ürün vitrini ücretsiz mi?",
        a: "Evet. Ücretsiz Standart üyelikle firma profili açabilir, dizinde yer alabilir ve on ürüne kadar yayımlayabilirsiniz. Ücretli paketlerin getirdiği şey görünmek değil öne çıkmaktır: dizinde öncelikli sıralama, sınırsız ürün, ürün belgesi ve videosu, “Doğrulanmış” rozeti ve herkese açık taleplere erişim.",
      },
      {
        q: "Bazı ürünlerde neden fiyat yazmıyor?",
        a: "Fiyat üç biçimde olabilir: sabit fiyat, miktara göre kademeli fiyat ya da “fiyat için teklif isteyin”. Üçüncüsü eksik veri değil, satıcının bilinçli tercihidir ve platform bunu cezalandırmaz — aksi hâlde satıcılar alanı doldurmak için gerçek olmayan bir fiyat yazardı. Fiyatlar KDV hariçtir ve satıcının beyanıdır.",
      },
      {
        q: "“Doğrulanmış” rozeti ne anlama geliyor?",
        a: "Firmanın ticaret sicili, vergi ve yetkili bilgilerini içeren belgelerinin Rothern tarafından incelendiği ve kabul edildiği anlamına gelir. Doğrulama istisnasız insan eliyle yapılır; otomatik onay yolu yoktur. Rozet firmanın kimliğine ilişkindir — ürün ya da hizmet kalitesi hakkında bir beyan değildir.",
      },
      {
        q: "Ürünler nasıl kategorilendiriliyor?",
        a: "Dört seviyeli (segment / aile / sınıf / ürün) uluslararası bir kategori ağacı kullanılır; kaynak Ariba'nın UNSPSC tabanlı kataloğudur ve 158 binden fazla kod içerir. Talep ve ürünler en az üçüncü seviyeden bir kodla açılır, böylece alıcı ile tedarikçi aynı dilde eşleşir.",
      },
    ],
  },
  {
    heading: "Hesap ve veri",
    items: [
      {
        q: "Kayıt olmak için onay bekliyor muyum?",
        a: "Hayır. Hesap, e-posta doğrulaması ve kısa bir kurulum adımından sonra hemen çalışır. Admin onayı yalnız belge doğrulaması (KYC) için gerekir ve o da her işlem için değil, platformun kefil olduğu yerlerde aranır: herkese açık talebe teklif, talep yayımlama ve kazandırma gibi.",
      },
      {
        q: "Ekibimden birkaç kişi aynı hesabı kullanabilir mi?",
        a: "Evet. Firma hesabına kullanıcı davet edilir ve her kişinin yetkisi tik tablosuyla ayrı ayrı belirlenir: satın alma, satış, onaylama ve yönetim. Satın alma ve satış tarafında işlem yapan her kişi bir “koltuk” tüketir; koltuk sayısı pakete bağlıdır. Yalnız görüntüleyen ya da onaylayan kişiler koltuk tüketmez.",
      },
      {
        q: "Kişisel verilerim ne oluyor?",
        a: "Rothern, KVKK kapsamında veri sorumlusudur. Aydınlatma metni ve gizlilik politikası site altındaki sözleşmeler bölümündedir; başvurularınızı kvkk@rothern.com adresine iletebilirsiniz. Firma profilinde herkese açık olan alanları siz seçersiniz; iletişim bilgileri ziyaretçilere değil yalnız kayıtlı üyelere gösterilir.",
      },
    ],
  },
];

export const FAQ_FLAT: Faq[] = FAQ_GROUPS.flatMap((g) => g.items);
