/**
 * PAZAR YERİ DEMO VERİSİ — `seed-marketplace-demo.ts`in yazdığı firmalar, ürünler,
 * talepler, bağlantılar ve teklifler (2026-09-04; ayrı dosyaya 2026-10-09'da alındı).
 *
 * NEDEN AYRI DOSYA: betik içe aktarılınca veritabanına bağlanıp yazmaya başlar;
 * veri burada durunca testler onu YAZMADAN okuyabiliyor. Sözleşme (API
 * `test/unit/seed-category-guard.spec.ts`) her koşuda üç şeyi kilitler:
 *   · hiçbir firma beyanı / ürün / talep GİZLİ segmentte değil (`HIDDEN_SEGMENTS`),
 *   · hiçbir ürün görseli / firma kapağı gizli segmentin FOTOĞRAFI değil,
 *   · ürün nitelikleri kategori matrisiyle uyuşuyor (`demoAttrProblems`),
 *   · görseller repoda var, teklifler gerçekten bir talebe bağlanıyor.
 *
 * GİZLİ SEGMENT KURALI (2026-10-09, kullanıcı: "anasayfada olmayan kategori
 * talepte, üründe ya da başka yerde de gösterilmesin"): demo vitrini yalnız
 * görünür 27 segmentte çalışır. Gıda, tıp, ofis mobilyası, tarım ürünü, BT
 * donanımı ve ev tekstili satan eski demo firmalar aynı anahtarla (e-posta,
 * bağlantılar korunur) görünür bir iş koluna taşındı:
 *   marmara → gıda işleme makineleri (23) · baskent → laboratuvar sarf ve
 *   cihazları (41) · yildiz → kağıt sarf (14) · antalya-tarim → sera ve sulama
 *   ekipmanı (21) · kayseri-mobilya → ahşap kapı ve dolap doğraması (30) ·
 *   mavi → yazılım hizmeti (81), alımı UPS (39) · ege, denizli-havlu → kumaş (11).
 * Yeni firma/ürün/talep eklerken kod görünür segmentten seçilir; gizli kod
 * betiği ilk satırda durdurur (`assertVisibleSeedCategories`).
 *
 * GÖRSEL DE AYNI KURALA UYAR: `img` görünür bir segmentin fotoğrafıdır. Kumaş
 * ürünleri giyim (53), fotokopi kağıdı ofis ekipmanı (44), depo yazılımı BT
 * (43) fotoğrafıyla duruyordu — kategorisi taşınmış, görseli gizli segmentte
 * kalmıştı; üçü de ürünün kendi segmentinin fotoğrafına alındı (11, 14, 81).
 */
import type { CompanyActivity, CompanyTier } from "@prisma/client";
import { categoryAncestors } from "@rothern/shared";
import { CATEGORY_ATTRIBUTES } from "../../../src/seeds/category-attributes";
import { seedPhotoCategoryRefs, type SeedCategoryRef } from "./seed-category-guard";

/**
 * DEMO GÖRSELİ = KÜRATÖRLÜ CC0 KATEGORİ FOTOĞRAFI (2026-09-07).
 *
 * Eskiden `loremflickr.com/<anahtar kelime>` idi: adres rastgele bir fotoğraf
 * döndürüyor ve enjektör kartında gaz maskeli adam, eldiven kartında para
 * sayan biri çıkıyordu — kırık görsel de sık (kullanıcı bulgusu). Yerine
 * `apps/web/public/categories/<segment>.webp` havuzu: 58 fotoğrafın hepsi
 * CC0/PDM, gözle seçilmiş, 1200×800 tek kırpma, repoda (kayıt:
 * docs/category-photo-credits.md). Ürün ve firma kaydına kategorisine göre
 * atanır — konusu her zaman doğru, lisansı temiz, ölçüsü tek tip.
 *
 * NOT: bunlar temsili DEMO görselleridir; gerçek firma kendi fotoğrafını
 * yükler (ürün görseli yayın kapısında zorunlu).
 */
export const segmentPhoto = (segment: string) => `/categories/${segment.slice(0, 2)}000000.webp`;

/* ───────────────────────── Firmalar ───────────────────────── */
export type Co = {
  key: string; name: string; tier: CompanyTier; city: string; industry: string;
  activities: CompanyActivity[]; about: string; services: string[]; certs: string[];
  founded: number; employees: string; sell: string[]; buy: string[];
  verified?: boolean; publicProfile?: boolean;
};
export const COMPANIES: Co[] = [
  { key: "anadolu", name: "Anadolu İnşaat A.Ş.", tier: "GOLD", city: "Ankara", industry: "İnşaat ve altyapı", activities: ["SERVICE_PROVIDER"], founded: 1994, employees: "250+", sell: ["72000000"], buy: ["30000000", "22000000"],
    about: "1994'ten bu yana kamu ve özel sektör için konut, ticari yapı ve altyapı projeleri yürütüyoruz. Ankara merkezli ekibimiz, Türkiye genelinde 40'tan fazla şantiyede anahtar teslim uygulama yapmıştır.", services: ["Anahtar teslim yapı", "Altyapı", "Restorasyon"], certs: ["ISO 9001", "ISO 45001"] },
  { key: "ege", name: "Ege Tekstil San. Tic. A.Ş.", tier: "GOLD", city: "İzmir", industry: "Tekstil ve konfeksiyon", activities: ["MANUFACTURER", "IMPORTER_EXPORTER"], founded: 1987, employees: "250+", sell: ["11000000"], buy: ["12000000"],
    about: "Örme ve dokuma kumaş üretiminde 35 yılı aşkın deneyim. Kendi boyahanemiz ve iplik tesisimizle Avrupa'daki hazır giyim markalarına OEKO-TEX sertifikalı kumaş tedarik ediyoruz.", services: ["Fason boyama", "Numune geliştirme"], certs: ["OEKO-TEX Standard 100", "ISO 9001", "GOTS"] },
  { key: "marmara", name: "Marmara Gıda Makineleri Ltd. Şti.", tier: "GOLD", city: "Bursa", industry: "Gıda işleme makineleri", activities: ["MANUFACTURER"], founded: 2003, employees: "50-249", sell: ["23000000"], buy: ["40000000", "26000000"],
    about: "Bursa'daki tesisimizde salça, konserve ve turşu üreticileri için dolum, kapatma ve sterilizasyon makineleri üretiyoruz. Paslanmaz çelik imalat, CE belgeli hatlar ve 14 ülkeye ihracat; kurulum ve devreye alma kendi ekibimizce yapılır.", services: ["Hat kurulumu ve devreye alma", "Yedek parça ve servis"], certs: ["ISO 9001", "CE"] },
  { key: "toros", name: "Toros Kimya A.Ş.", tier: "GOLD", city: "Adana", industry: "Endüstriyel kimya", activities: ["MANUFACTURER", "DISTRIBUTOR"], founded: 1999, employees: "50-249", sell: ["12000000"], buy: ["24000000"],
    about: "Endüstriyel temizlik kimyasalları, su arıtma ve tekstil yardımcı kimyasalları üretiyoruz. Adana OSB'deki tesisimiz REACH uyumlu; teknik ekibimiz saha uygulama desteği verir.", services: ["Teknik danışmanlık", "Dökme teslimat"], certs: ["ISO 9001", "ISO 14001"] },
  { key: "karadeniz", name: "Karadeniz Enerji A.Ş.", tier: "GOLD", city: "Samsun", industry: "Enerji ve elektrik", activities: ["SERVICE_PROVIDER", "DISTRIBUTOR"], founded: 2008, employees: "50-249", sell: ["26000000", "39000000"], buy: ["26000000", "39000000"],
    about: "Orta gerilim şebeke tesisi, trafo merkezi kurulumu ve güneş enerjisi santrali EPC işleri yapıyoruz. Karadeniz bölgesinde 120 MW kurulu güçte proje teslim ettik.", services: ["GES EPC", "OG/AG tesisat", "Bakım"], certs: ["ISO 9001", "ISO 45001"] },
  { key: "baskent", name: "Başkent Medikal Ltd. Şti.", tier: "GOLD", city: "Ankara", industry: "Laboratuvar ve ölçüm cihazları", activities: ["DISTRIBUTOR", "IMPORTER_EXPORTER"], founded: 2005, employees: "50-249", sell: ["41000000"], buy: ["41000000"],
    about: "Üniversite, hastane ve sanayi laboratuvarlarına sarf malzeme, numune kabı ve ölçüm cihazı tedarik ediyoruz. CE belgeli 2.400 kalem ürün, 48 saat içinde teslimat; cihazlarda kurulum ve kalibrasyon desteği.", services: ["Laboratuvar sarf tedariki", "Cihaz bakım ve kalibrasyon"], certs: ["ISO 9001", "CE"] },
  { key: "akdeniz", name: "Akdeniz Lojistik A.Ş.", tier: "SILVER", city: "Mersin", industry: "Lojistik ve depolama", activities: ["SERVICE_PROVIDER"], founded: 2001, employees: "250+", sell: ["78000000"], buy: ["24000000", "25000000"],
    about: "Mersin Limanı'na 3 km mesafede 40 bin m² kapalı depo, soğuk zincir ve konteyner nakliyesi. Türkiye genelinde 180 araçlık filo ile parsiyel ve komple taşıma.", services: ["Depolama", "Soğuk zincir", "Gümrükleme"], certs: ["ISO 9001", "ISO 28000"] },
  { key: "metal", name: "İç Anadolu Metal San. A.Ş.", tier: "GOLD", city: "Konya", industry: "Metal işleme", activities: ["MANUFACTURER", "CONTRACT_MANUFACTURER"], founded: 1991, employees: "50-249", sell: ["31000000", "30000000"], buy: ["11000000", "23000000"],
    about: "Lazer kesim, abkant büküm ve CNC talaşlı imalatta 30 yıllık tecrübe. Konya OSB'de 12 bin m² kapalı alanda otomotiv ve beyaz eşya yan sanayine fason üretim yapıyoruz.", services: ["Lazer kesim", "CNC işleme", "Toz boya"], certs: ["ISO 9001", "IATF 16949"] },
  { key: "yildiz", name: "Yıldız Ofis Malzemeleri", tier: "SILVER", city: "İstanbul", industry: "Kağıt ve ofis sarf malzemeleri", activities: ["DISTRIBUTOR"], founded: 2012, employees: "10-49", sell: ["14000000"], buy: ["14000000"],
    about: "Kurumsal ofislere ve işletmelere fotokopi kağıdı, kağıt havlu ve yazar kasa rulosu gibi kağıt sarf ürünleri tedarik ediyoruz. İstanbul içi ertesi gün teslimat, tek fatura, aylık mutabakat.", services: ["Kurumsal tedarik", "Düzenli sevkiyat"], certs: ["ISO 9001"] },
  { key: "demir", name: "Demir Hırdavat Ltd.", tier: "SILVER", city: "Gaziantep", industry: "Hırdavat ve el aletleri", activities: ["DISTRIBUTOR", "IMPORTER_EXPORTER"], founded: 1998, employees: "10-49", sell: ["27000000", "31000000"], buy: ["27000000"],
    about: "Bağlantı elemanları, el aletleri ve endüstriyel sarf malzemede toptan tedarikçi. 8.000 kalem stok, Gaziantep ve Güneydoğu'da aynı gün sevkiyat.", services: ["Toptan satış", "Bayilik"], certs: [] },
  { key: "gunes", name: "Güneş Temizlik Hizmetleri", tier: "SILVER", city: "İstanbul", industry: "Tesis hizmetleri", activities: ["SERVICE_PROVIDER"], founded: 2010, employees: "250+", sell: ["76000000"], buy: ["47000000"],
    about: "Fabrika, AVM ve ofis binalarında profesyonel temizlik, dış cephe ve endüstriyel temizlik hizmeti veriyoruz. 600 personel, 7/24 operasyon.", services: ["Endüstriyel temizlik", "Dış cephe", "Peyzaj"], certs: ["ISO 9001", "ISO 14001"] },
  { key: "mavi", name: "Mavi Bilişim Çözümleri", tier: "SILVER", city: "İstanbul", industry: "Yazılım ve BT", activities: ["SERVICE_PROVIDER"], founded: 2015, employees: "50-249", sell: ["81000000"], buy: ["39000000"],
    about: "Üretim ve lojistik firmaları için ERP entegrasyonu, depo yönetim yazılımı ve saha mobil uygulamaları geliştiriyoruz. 70 kurumsal müşteri, SaaS ve yerinde kurulum.", services: ["ERP entegrasyonu", "WMS", "Mobil uygulama"], certs: ["ISO 27001"] },
  { key: "bursa-oto", name: "Bursa Otomotiv Parça San. A.Ş.", tier: "GOLD", city: "Bursa", industry: "Otomotiv yan sanayi", activities: ["MANUFACTURER", "CONTRACT_MANUFACTURER"], founded: 1996, employees: "250+", sell: ["25000000", "31000000"], buy: ["11000000", "31000000"],
    about: "Ana sanayiye şasi ve süspansiyon parçaları üretiyoruz. Robotik kaynak hatları, 3 vardiya, IATF 16949 belgeli kalite sistemi ve Avrupa'ya doğrudan sevkiyat.", services: ["Fason kaynak", "Pres"], certs: ["IATF 16949", "ISO 14001"] },
  { key: "kocaeli-plastik", name: "Kocaeli Plastik Ambalaj Ltd.", tier: "SILVER", city: "Kocaeli", industry: "Plastik ve ambalaj", activities: ["MANUFACTURER"], founded: 2009, employees: "50-249", sell: ["24000000", "30000000"], buy: ["13000000"],
    about: "Gıda ve kimya sektörü için PET, HDPE şişe ve endüstriyel ambalaj üretiyoruz. Kendi kalıphanemizle özel tasarım, 20 enjeksiyon ve şişirme hattı.", services: ["Özel kalıp", "Baskılı ambalaj"], certs: ["BRC Packaging", "ISO 9001"] },
  { key: "izmir-makina", name: "İzmir Makina Endüstri A.Ş.", tier: "GOLD", city: "İzmir", industry: "Makine imalatı", activities: ["MANUFACTURER", "IMPORTER_EXPORTER"], founded: 1985, employees: "50-249", sell: ["23000000", "40000000"], buy: ["31000000", "26000000"],
    about: "Gıda ve kimya sanayi için paslanmaz proses ekipmanı, karıştırıcı, tank ve konveyör sistemleri üretiyoruz. 38 ülkeye ihracat, 1985'ten beri aynı tesiste.", services: ["Proje mühendisliği", "Montaj ve devreye alma"], certs: ["ISO 9001", "CE", "PED"] },
  { key: "antalya-tarim", name: "Antalya Tarım Ürünleri Koop.", tier: "SILVER", city: "Antalya", industry: "Tarım ve seracılık", activities: ["DISTRIBUTOR", "IMPORTER_EXPORTER"], founded: 2004, employees: "50-249", sell: ["21000000"], buy: ["21000000", "14000000"],
    about: "Sera üreticisi 240 ortağımıza ve bölge çiftçilerine damla sulama, sera havalandırma ve ilaçlama ekipmanı tedarik ediyoruz. Ortaklarımızın ürününü GlobalGAP sertifikalı tesisimizde paketleyip ihraç ediyor, sezon boyunca teknik destek veriyoruz.", services: ["Sera ekipmanı tedariki", "Sulama projelendirme", "İhracat paketleme"], certs: ["GlobalGAP", "ISO 9001"] },
  { key: "trakya-elektrik", name: "Trakya Elektrik Malzemeleri", tier: "SILVER", city: "Tekirdağ", industry: "Elektrik malzemeleri", activities: ["DISTRIBUTOR"], founded: 2011, employees: "10-49", sell: ["39000000", "26000000"], buy: ["39000000"],
    about: "Kablo, pano, şalt malzemesi ve aydınlatmada Çerkezköy merkezli toptan tedarikçi. 14 markanın yetkili bayisi, projeye özel fiyatlandırma ve şantiye teslimi.", services: ["Proje tedariki", "Şantiye teslimi"], certs: ["ISO 9001"] },
  { key: "kayseri-mobilya", name: "Kayseri Mobilya San. Ltd.", tier: "SILVER", city: "Kayseri", industry: "Mobilya ve ahşap doğrama", activities: ["MANUFACTURER"], founded: 2000, employees: "50-249", sell: ["30000000"], buy: ["11000000", "30000000"],
    about: "Otel ve ofis projeleri için ahşap kapı, gömme dolap ve banko üretiyoruz; proje bazlı özel ölçü, 15 bin m² üretim alanı. Türkiye'de 300'den fazla otel ve plaza projesi tamamladık.", services: ["Proje doğraması", "Montaj"], certs: ["ISO 9001", "FSC"] },
  { key: "samsun-ambalaj", name: "Samsun Oluklu Mukavva A.Ş.", tier: "SILVER", city: "Samsun", industry: "Kağıt ve ambalaj", activities: ["MANUFACTURER"], founded: 2007, employees: "50-249", sell: ["14000000", "24000000"], buy: ["14000000"],
    about: "Oluklu mukavva koli, tepsi ve baskılı ambalaj üretiyoruz. Gıda ve fındık ihracatçılarına özel ölçü, 3 ve 5 katlı seçenekler, haftalık 400 ton kapasite.", services: ["Özel ölçü koli", "Flekso baskı"], certs: ["FSC", "ISO 9001"] },
  { key: "denizli-havlu", name: "Denizli Havlu ve Ev Tekstili", tier: "STANDART", city: "Denizli", industry: "Dokuma kumaş", activities: ["MANUFACTURER"], founded: 2013, employees: "50-249", sell: ["11000000"], buy: ["11000000"], publicProfile: false, verified: false,
    about: "Havlu, bornoz ve nevresim üreticileri için pamuklu dokuma kumaş üretiyoruz. Paketsiz üye örneği: profil herkese açık değil.", services: ["Fason dokuma"], certs: [] },
];

export const CONNECTIONS: [string, string][] = [
  ["yildiz", "anadolu"], ["demir", "metal"], ["mavi", "baskent"], ["gunes", "akdeniz"], ["ege", "marmara"],
  ["toros", "karadeniz"], ["yildiz", "ege"], ["demir", "toros"], ["bursa-oto", "metal"], ["kocaeli-plastik", "marmara"],
  ["izmir-makina", "toros"], ["antalya-tarim", "akdeniz"], ["trakya-elektrik", "karadeniz"], ["samsun-ambalaj", "antalya-tarim"],
  ["kayseri-mobilya", "yildiz"], ["denizli-havlu", "ege"],
];

/* ───────────────────────── Ürünler ───────────────────────── */
export type Pr = {
  owner: string; name: string; cat: string; catKw?: string; desc: string; spec?: string; brand?: string; mpn?: string;
  unit: string; kw: string[]; img: string; attrs?: Record<string, string | string[] | number>; price?: number; tiers?: { minQty: number; unitPrice: number }[]; moq?: number; cur?: "TRY" | "USD" | "EUR";
};
export const PRODUCTS: Pr[] = [
  // ege
  { owner: "ege", name: "%100 Pamuk Penye Kumaş 180 g/m²", cat: "11162100", catKw: "kumaş", desc: "Ne 30/1 penye iplikten örülmüş, 180 g/m² gramajlı süprem kumaş. Tişört ve iç giyim için; OEKO-TEX sertifikalı, reaktif boyalı, 60 renk seçeneği. Top ağırlığı 25–30 kg.", spec: "En: 180 cm (açık)\nGramaj: 180 g/m² ±5\nÇekme: max %5 (60°C)", brand: "Ege Tekstil", unit: "kg", kw: ["penye", "süprem", "pamuk kumaş", "tişört kumaşı"], img: "/categories/11000000.webp", tiers: [{ minQty: 100, unitPrice: 245 }, { minQty: 500, unitPrice: 228 }, { minQty: 2000, unitPrice: 212 }], moq: 100, attrs: {"malzeme": ["Pamuk"], "form": "Top / rulo", "standart": ["ISO", "EN"]} },
  { owner: "ege", name: "Polyester Astar Kumaş 60 g/m²", cat: "11162100", catKw: "kumaş", desc: "Ceket ve mont astarı için 60 g/m² polyester taft astar. 150 cm en, antistatik apre, 40 stok renk. Konfeksiyon fasonculara top bazında sevkiyat.", brand: "Ege Tekstil", unit: "m", kw: ["astar", "polyester", "taft"], img: "/categories/11000000.webp", price: 38, moq: 500, attrs: {"malzeme": ["Polyester"], "form": "Top / rulo", "standart": ["ISO"]} },
  { owner: "ege", name: "Organik Pamuk İplik Ne 20/1 (GOTS)", cat: "11151600", desc: "GOTS sertifikalı organik pamuktan ring iplik, Ne 20/1, örme ve dokuma için. 1,8 kg bobin, palet bazında teslim. Test raporu her partide.", brand: "Ege Tekstil", mpn: "EGE-OC-20", unit: "kg", kw: ["organik pamuk", "iplik", "GOTS", "ring iplik"], img: "/categories/11000000.webp", price: 168, moq: 500, attrs: {"malzeme": ["Pamuk"], "form": "Bobin", "standart": ["ISO"]} },
  // marmara
  { owner: "marmara", name: "Salça Dolum ve Kapatma Makinesi (5 kg Teneke)", cat: "23181501", desc: "Teneke kutuya salça ve püre dolumu için pistonlu dolum ve otomatik kapatma makinesi; saatte 600 teneke, 5 kg'a kadar ayarlı dozaj. AISI 304 gövde, CIP uyumlu; kurulum ve operatör eğitimi dahil.", brand: "Marmara", mpn: "MGM-D5", unit: "adet", kw: ["dolum makinesi", "salça dolum", "teneke kapatma", "gıda makinesi"], img: "/categories/23000000.webp", price: 1480000, moq: 1, attrs: {"durum": "Sıfır", "guc": 4, "kontrol": "PLC", "besleme": "380 V trifaze"} },
  { owner: "marmara", name: "Konserve Otoklavı 1.200 L (Yatay, Buharlı)", cat: "23181705", desc: "Teneke ve cam kavanoz konserveler için yatay buharlı otoklav; 1.200 L hazne, 4 sepet. Karşı basınçlı soğutma, PLC reçete kontrolü ve F0 kaydı; özel markalı üretim yapan tesislere anahtar teslim kurulum.", brand: "Marmara", unit: "adet", kw: ["otoklav", "konserve sterilizasyon", "gıda makinesi"], img: "/categories/23000000.webp", moq: 1, attrs: {"durum": "Sıfır", "guc": 3, "kontrol": "PLC", "besleme": "380 V trifaze"} },
  { owner: "marmara", name: "Kornişon Yıkama ve Boylama Hattı (2 t/saat)", cat: "23181506", desc: "Turşuluk salatalık için fırçalı yıkama, hava üflemeli ön kurutma ve makaralı boylama hattı; saatte 2 ton kapasite. Paslanmaz gövde, hız kontrollü bantlar ve modüler kurulum; ihracat hatlarına uygun.", brand: "Marmara", unit: "adet", kw: ["yıkama hattı", "boylama makinesi", "turşu hattı"], img: "/categories/23000000.webp", price: 620000, moq: 1, attrs: {"durum": "Sıfır", "guc": 5.5, "kontrol": "Yarı otomatik", "besleme": "380 V trifaze"} },
  // toros
  { owner: "toros", name: "Kostik Soda %99 (Sodyum Hidroksit) 25 kg", cat: "12352300", catKw: "hidroksit", desc: "%99 saflıkta pul kostik soda, 25 kg PE torba, paletli. Tekstil, sabun ve su arıtma sektörü için; analiz sertifikası her partide.", brand: "Toros Kimya", unit: "kg", kw: ["kostik", "sodyum hidroksit", "NaOH"], img: "/categories/12000000.webp", tiers: [{ minQty: 1000, unitPrice: 24 }, { minQty: 10000, unitPrice: 21.5 }], moq: 1000, attrs: {"fiziksel_hal": "Katı", "saflik": 99, "ambalaj": ["Torba"], "tehlike": ["Aşındırıcı"], "sertifika": ["ISO 9001", "SDS mevcut", "REACH"]} },
  { owner: "toros", name: "Endüstriyel Yağ Sökücü Konsantre 20 L", cat: "47131800", catKw: "temizleyici", desc: "Makine ve zemin yağlarını çözen alkali konsantre, 1:20 seyreltme. Gıda tesislerinde kullanıma uygun (NSF A1 muadili), 20 L bidon.", brand: "Toros Kimya", mpn: "TK-YS-20", unit: "adet", kw: ["yağ sökücü", "endüstriyel temizlik", "alkali"], img: "/categories/47000000.webp", price: 1450, moq: 4, attrs: {"urun_tipi": ["Endüstriyel kimyasal", "Genel temizlik"], "konsantrasyon": "Konsantre", "ambalaj": ["Bidon"], "sertifika": ["ISO 9001", "Gıda temasına uygun"]} },
  { owner: "toros", name: "Polielektrolit Anyonik Flokülant 25 kg", cat: "12352300", catKw: "polimer", desc: "Atık su arıtma için yüksek molekül ağırlıklı anyonik polielektrolit. Çamur susuzlaştırma ve çöktürme; 25 kg torba, dozaj danışmanlığı dahil.", brand: "Toros Kimya", unit: "kg", kw: ["flokülant", "polielektrolit", "arıtma"], img: "/categories/40000000.webp", moq: 25, attrs: {"fiziksel_hal": "Toz", "ambalaj": ["Torba"], "tehlike": ["Tehlikesiz"], "sertifika": ["ISO 9001", "SDS mevcut"]} },
  // karadeniz
  { owner: "karadeniz", name: "Kuru Tip Trafo 1000 kVA 34,5/0,4 kV", cat: "39121000", catKw: "trafo", desc: "Reçine döküm kuru tip dağıtım trafosu, 1000 kVA, 34,5/0,4 kV, Dyn11. IEC 60076-11, 2 yıl garanti; devreye alma hizmeti opsiyonel.", brand: "Karadeniz", unit: "adet", kw: ["trafo", "kuru tip", "dağıtım trafosu", "34.5 kV"], img: "/categories/26000000.webp", moq: 1, attrs: {"gerilim": "Orta gerilim (1-36 kV)", "koruma_sinifi": "IP20", "kullanim_alani": ["Enerji dağıtımı", "Sanayi"], "sertifika": ["CE", "IEC", "TSE"]} },
  { owner: "karadeniz", name: "GES Kurulumu (Çatı) — kW Başına", cat: "26111700", catKw: "güneş", desc: "Sanayi çatısına anahtar teslim güneş enerjisi santrali: panel, inverter, konstrüksiyon, AG pano ve şebeke bağlantı projesi. 25 yıl panel performans garantisi.", brand: "Karadeniz", unit: "kW", kw: ["GES", "güneş enerjisi", "çatı GES", "EPC"], img: "/categories/26000000.webp", price: 19500, moq: 100, attrs: {"kaynak": "Güneş (PV)", "gerilim": "Alçak gerilim (<1 kV)", "durum": "Sıfır", "sertifika": ["CE", "IEC"]} },
  { owner: "karadeniz", name: "Kompanzasyon Panosu 400 kVAr", cat: "39121000", catKw: "pano", desc: "Reaktif güç kompanzasyon panosu, 400 kVAr, 12 kademe, harmonik filtreli. Pano içi bakır bara, kontaktörler Schneider; devreye alma dahil.", brand: "Karadeniz", unit: "adet", kw: ["kompanzasyon", "pano", "reaktif güç"], img: "/categories/39000000.webp", price: 185000, moq: 1, attrs: {"gerilim": "Alçak gerilim (<1 kV)", "koruma_sinifi": "IP54", "kullanim_alani": ["Sanayi", "Enerji dağıtımı"], "sertifika": ["CE", "TSE"]} },
  // baskent
  { owner: "baskent", name: "Pipet Ucu 200 µl Sarı (1000'li Torba)", cat: "41121600", desc: "200 µl evrensel sarı pipet ucu; DNase/RNase içermez, otoklavlanabilir polipropilen. 1000'lik torba, kolide 20 torba; yaygın tek ve çok kanallı pipetlerle uyumlu, lot bazında analiz sertifikalı.", brand: "LabSafe", mpn: "LS-PT-200", unit: "torba", kw: ["pipet ucu", "200 µl", "laboratuvar sarf"], img: "/categories/41000000.webp", tiers: [{ minQty: 10, unitPrice: 165 }, { minQty: 100, unitPrice: 149 }, { minQty: 1000, unitPrice: 138 }], moq: 10, attrs: {"durum": "Sıfır", "kullanim_alani": ["Analitik kimya", "Mikrobiyoloji"], "sertifika": ["CE"]} },
  { owner: "baskent", name: "Laboratuvar Şırıngası 5 ml Luer-Lock (Steril)", cat: "41122000", desc: "Luer-lock 5 ml numune alma şırıngası, steril, tekli blister; filtrasyon ve numune hazırlama için. Koli 1.000 adet; laboratuvar ve kalite kontrol birimlerine palet bazında sevkiyat.", brand: "LabSafe", unit: "adet", kw: ["şırınga", "luer lock", "numune alma"], img: "/categories/41000000.webp", price: 2.9, moq: 1000, attrs: {"durum": "Sıfır", "kullanim_alani": ["Analitik kimya", "Gıda"], "sertifika": ["CE"]} },
  { owner: "baskent", name: "Laboratuvar Santrifüjü 12x15 ml (4.500 rpm)", cat: "41103900", desc: "Masa üstü laboratuvar santrifüjü: 12x15 ml açılı rotor, 4.500 rpm, dijital hız ve süre ayarı, kapak kilidi ve dengesizlik koruması. CE belgeli, 2 yıl garanti; kurulum ve kullanıcı eğitimi dahil.", brand: "VitaLab", unit: "adet", kw: ["santrifüj", "laboratuvar cihazı", "masa üstü santrifüj"], img: "/categories/41000000.webp", moq: 1, attrs: {"durum": "Sıfır", "kullanim_alani": ["Tıbbi tanı", "Mikrobiyoloji"], "sertifika": ["CE", "IVD"]} },
  // akdeniz
  { owner: "akdeniz", name: "Soğuk Hava Deposu Kiralama (Palet/Ay)", cat: "78131600", catKw: "depolama", desc: "Mersin'de -18°C ve +4°C soğuk depo, palet-ay bazında kiralama. WMS ile stok görünürlüğü, 7/24 giriş-çıkış, sigortalı depolama.", brand: "Akdeniz Lojistik", unit: "palet", kw: ["soğuk depo", "depolama", "Mersin"], img: "/categories/24000000.webp", price: 420, moq: 20, attrs: {"tasima_modu": ["Karayolu"], "hizmet_tipi": ["Depolama", "Soğuk zincir"], "kapsam": "Yurt içi", "yetki_belgesi": ["L2"]} },
  { owner: "akdeniz", name: "Komple Tır Nakliye İstanbul–Mersin", cat: "78101800", catKw: "nakliye", desc: "13,6 m tenteli tır ile komple yük taşıma, İstanbul–Mersin arası 24 saat teslim. Sigortalı, GPS takipli, e-irsaliye entegrasyonu.", brand: "Akdeniz Lojistik", unit: "sefer", kw: ["nakliye", "tır", "komple yük"], img: "/categories/78000000.webp", price: 28500, moq: 1, attrs: {"tasima_modu": ["Karayolu"], "hizmet_tipi": ["Komple (FTL)"], "kapsam": "Yurt içi", "yetki_belgesi": ["K1", "ADR"]} },
  // metal
  { owner: "metal", name: "Lazer Kesim Sac Parça (DKP 2 mm)", cat: "31163200", catKw: "kesim", desc: "Fiber lazer ile DKP 2 mm sac parça kesimi; çizime göre üretim, 6 kW lazer, ±0,1 mm tolerans. Kilogram bazında fiyat, DXF/DWG ile teklif.", brand: "İç Anadolu Metal", unit: "kg", kw: ["lazer kesim", "sac parça", "fason"], img: "/categories/23000000.webp", price: 62, moq: 100, attrs: {"imalat_yontemi": ["Sac işleme"], "malzeme": ["Çelik"], "tolerans": "±0,1 mm", "yuzey": ["Ham"]} },
  { owner: "metal", name: "Kutu Profil 40x40x2 mm (6 m)", cat: "30102300", desc: "S235JR sıcak haddelenmiş kutu profil 40x40x2 mm, 6 m boy, ~14 kg. Ton bazında sevkiyat, Konya depodan aynı gün yükleme.", brand: "İç Anadolu Metal", unit: "adet", kw: ["kutu profil", "çelik profil", "40x40"], img: "/categories/11000000.webp", tiers: [{ minQty: 50, unitPrice: 690 }, { minQty: 500, unitPrice: 645 }], moq: 50, attrs: {"malzeme": ["Çelik"], "uygulama": ["Kaba yapı"], "standart": ["EN", "TSE"]} },
  { owner: "metal", name: "CNC Freze İşleme Hizmeti (Saat)", cat: "73171600", catKw: "talaşlı", desc: "3 ve 5 eksen CNC freze ile alüminyum ve çelik parça işleme. 20 tezgah, CAM programlama dahil, CMM ölçüm raporu; saatlik ya da parça bazlı teklif.", brand: "İç Anadolu Metal", unit: "saat", kw: ["CNC", "freze", "talaşlı imalat"], img: "/categories/31000000.webp", price: 1250, moq: 8, attrs: {"hizmet": ["Talaşlı imalat"], "parti_buyuklugu": "Orta parti (100-1000)", "tolerans": "±0,02 mm", "malzeme": ["Alüminyum", "Çelik"]} },
  { owner: "metal", name: "Elektrostatik Toz Boya Hizmeti (m²)", cat: "73171600", catKw: "boya", desc: "Metal parça ve profillerde RAL kartelasına göre elektrostatik toz boya; 6 m fırın, ön yıkama hattı. m² bazında fiyat, 3 gün termin.", brand: "İç Anadolu Metal", unit: "m²", kw: ["toz boya", "elektrostatik", "RAL"], img: "/categories/73000000.webp", price: 145, moq: 20, attrs: {"hizmet": ["Yüzey kaplama", "Boyama"], "parti_buyuklugu": "Seri üretim (>1000)", "malzeme": ["Çelik", "Alüminyum"]} },
  // yildiz
  { owner: "yildiz", name: "Fotokopi Kağıdı A4 80 g (5'li Koli)", cat: "14111500", catKw: "kağıt", desc: "A4 80 g/m² fotokopi kağıdı, 500 yaprak × 5 paket. Tüm yazıcı ve fotokopi makineleriyle uyumlu, FSC sertifikalı; İstanbul içi ertesi gün teslim.", brand: "Yıldız", unit: "koli", kw: ["A4 kağıt", "fotokopi kağıdı", "kırtasiye"], img: "/categories/14000000.webp", tiers: [{ minQty: 10, unitPrice: 690 }, { minQty: 100, unitPrice: 655 }], moq: 10, attrs: {"kagit_tipi": ["Birinci hamur"], "gramaj": 80, "form": "Tabaka", "geri_donusum": "Birinci hamur", "sertifika": ["FSC", "ISO 9001"]} },
  { owner: "yildiz", name: "Kağıt Havlu Rulo Hareketli 21 cm (6'lı Koli)", cat: "14111703", desc: "Hareketli ve fotoselli dispenserlerle uyumlu 21 cm kağıt havlu rulosu; çift kat, 150 m sarım, kolide 6 rulo. %100 selüloz, yüksek emicilik; ofis, fabrika ve AVM lavaboları için düzenli sevkiyat.", brand: "Yıldız", unit: "koli", kw: ["kağıt havlu", "hareketli havlu", "temizlik kağıdı"], img: "/categories/14000000.webp", price: 485, moq: 10, attrs: {"kagit_tipi": ["Temizlik kağıdı"], "form": "Rulo", "geri_donusum": "Birinci hamur", "sertifika": ["FSC", "ISO 9001"]} },
  // demir
  { owner: "demir", name: "Galvanizli Altıköşe Cıvata M12x50 (DIN 933) 8.8", cat: "31161500", desc: "8.8 kalite, sıcak daldırma galvanizli altıköşe başlı cıvata M12x50, DIN 933. Kutu 100 adet; çelik konstrüksiyon ve makine montajı için.", brand: "FixPro", mpn: "FP-933-1250", unit: "adet", kw: ["cıvata", "DIN 933", "galvaniz", "bağlantı elemanı"], img: "/categories/31000000.webp", tiers: [{ minQty: 100, unitPrice: 9.8 }, { minQty: 5000, unitPrice: 8.4 }], moq: 100, attrs: {"imalat_yontemi": ["Dövme"], "malzeme": ["Çelik"], "yuzey": ["Galvaniz"], "tolerans": "DIN 933 · 8.8 kalite"} },
  { owner: "demir", name: "Akülü Matkap/Vidalama 18V 2 Ah (2 Akü)", cat: "27112700", catKw: "matkap", desc: "18V fırçasız motorlu darbeli matkap/vidalama, 60 Nm, 2 × 2 Ah akü ve şarj cihazı ile taşıma çantasında. 2 yıl garanti, yetkili servis.", brand: "PowerTek", unit: "adet", kw: ["matkap", "akülü", "el aleti"], img: "/categories/27000000.webp", price: 3290, moq: 1, attrs: {"durum": "Sıfır", "tahrik": "Akülü"} },
  { owner: "demir", name: "Kesme Diski 115x1 mm Inox (25'li)", cat: "23131500", catKw: "disk", desc: "Paslanmaz çelik için ince kesme diski 115x1,0x22,2 mm, 25'li paket. EN 12413, 13.300 d/dk; avuç taşlama makineleriyle uyumlu.", brand: "PowerTek", unit: "paket", kw: ["kesme diski", "inox", "taşlama"], img: "/categories/27000000.webp", price: 285, moq: 4, attrs: {"durum": "Sıfır"} },
  // gunes
  { owner: "gunes", name: "Fabrika Temizlik Hizmeti (Aylık, m²)", cat: "76111500", catKw: "temizlik", desc: "Üretim tesisleri için günlük genel temizlik, makine çevresi ve sosyal alanlar; personel, ekipman ve sarf dahil. m²/ay bazında sözleşme, SLA raporu.", brand: "Güneş", unit: "m²", kw: ["fabrika temizliği", "endüstriyel temizlik", "tesis hizmeti"], img: "/categories/76000000.webp", price: 18, moq: 1000, attrs: {"hizmet_tipi": ["Fabrika temizliği", "Dezenfeksiyon"], "calisma_modeli": "Sözleşmeli (periyodik)", "ekip_buyuklugu": 12, "sertifika": ["ISO 9001", "ISO 45001"]} },
  { owner: "gunes", name: "Dış Cephe ve Cam Temizliği (m²)", cat: "76111500", catKw: "cephe", desc: "İple erişim ve platformla dış cephe cam temizliği; yüksekte çalışma sertifikalı ekip, sigortalı. m² bazında, plaza ve AVM referansları.", brand: "Güneş", unit: "m²", kw: ["dış cephe", "cam temizliği", "iple erişim"], img: "/categories/72000000.webp", price: 42, moq: 500, attrs: {"hizmet_tipi": ["Cephe temizliği"], "calisma_modeli": "Proje bazlı", "ekip_buyuklugu": 6, "sertifika": ["ISO 45001"]} },
  // mavi
  { owner: "mavi", name: "Depo Yönetim Yazılımı (WMS) — Kullanıcı/Ay", cat: "81162000", desc: "Barkod ve el terminali destekli bulut depo yönetimi: mal kabul, adresleme, toplama, sayım ve ERP entegrasyonu. Kullanıcı başına aylık, kurulum ve eğitim dahil.", brand: "MaviWMS", unit: "kullanıcı", kw: ["WMS", "depo yazılımı", "SaaS", "barkod"], img: "/categories/81000000.webp", price: 1290, moq: 5, attrs: {"hizmet_tipi": ["Yazılım geliştirme", "Sistem entegrasyonu"], "calisma_modeli": "Sözleşmeli (periyodik)", "calisma_bicimi": "Uzaktan", "yetki_belgesi": ["ISO 27001", "ISO 9001"]} },
  { owner: "mavi", name: "ERP Entegrasyon Danışmanlığı (Adam/Gün)", cat: "81111800", catKw: "danışmanlık", desc: "Logo, Netsis, SAP B1 ile e-ticaret, saha ve üretim sistemleri arasında entegrasyon. Analiz, geliştirme ve devreye alma; adam/gün bazında teklif.", brand: "Mavi Bilişim", unit: "gün", kw: ["ERP", "entegrasyon", "danışmanlık"], img: "/categories/81000000.webp", price: 9500, moq: 5, attrs: {"hizmet_tipi": ["Sistem entegrasyonu"], "calisma_modeli": "Danışmanlık", "calisma_bicimi": "Karma", "yetki_belgesi": ["ISO 9001"]} },
  // bursa-oto
  { owner: "bursa-oto", name: "Kaynaklı Şasi Traversi (OEM Parça)", cat: "25171700", catKw: "şasi", desc: "Robotik MAG kaynaklı şasi traversi, S420MC sac, KTL kaplama. OEM çizimine göre üretim, PPAP dosyası ve %100 fikstür kontrolü.", brand: "Bursa Oto", unit: "adet", kw: ["şasi", "travers", "OEM", "kaynaklı parça"], img: "/categories/25000000.webp", moq: 500, attrs: {"durum": "Sıfır", "arac_tipi": "Yedek parça"} },
  { owner: "bursa-oto", name: "Pres Baskı Sac Parça (2–6 mm)", cat: "31163200", catKw: "pres", desc: "400–1.000 ton preslerde progresif ve transfer kalıpla sac parça üretimi. Otomotiv ve beyaz eşya; kalıp tasarımı dahil, IATF 16949.", brand: "Bursa Oto", unit: "adet", kw: ["pres", "sac parça", "progresif kalıp"], img: "/categories/31000000.webp", moq: 1000, attrs: {"imalat_yontemi": ["Sac işleme", "Kaynak"], "malzeme": ["Çelik"], "tolerans": "±0,2 mm", "yuzey": ["Ham", "Kaplamalı"]} },
  { owner: "bursa-oto", name: "Fren Diski Havalı 300 mm (Aftermarket)", cat: "25172400", catKw: "fren", desc: "Havalı fren diski 300 mm, GG20 döküm, balanslı; hafif ticari araçlar için aftermarket. ECE R90, 2 yıl garanti, kolide 2 adet.", brand: "Bursa Oto", mpn: "BO-FD-300V", unit: "adet", kw: ["fren diski", "aftermarket", "yedek parça"], img: "/categories/25000000.webp", tiers: [{ minQty: 20, unitPrice: 1650 }, { minQty: 200, unitPrice: 1480 }], moq: 20, attrs: {"durum": "Sıfır", "arac_tipi": "Yedek parça"} },
  // kocaeli-plastik
  { owner: "kocaeli-plastik", name: "PET Şişe 500 ml (Preform + Şişirme)", cat: "24121800", catKw: "şişe", desc: "500 ml PET şişe, 28 mm PCO 1881 ağız, 18 g; su, meyve suyu ve kimyasal dolum için. Şeffaf ve mavi tonlu, palet bazında (10.000 adet).", brand: "Kocaeli Plastik", unit: "adet", kw: ["PET şişe", "ambalaj", "500 ml"], img: "/categories/13000000.webp", tiers: [{ minQty: 10000, unitPrice: 2.35 }, { minQty: 100000, unitPrice: 2.1 }], moq: 10000, attrs: {"durum": "Sıfır"} },
  { owner: "kocaeli-plastik", name: "HDPE Bidon 20 L UN Onaylı", cat: "24121800", catKw: "bidon", desc: "Kimyasal ve gıda taşımaya uygun 20 L HDPE bidon, UN 3H1 onaylı, DIN 61 kapak. Lacivert/beyaz, baskılı etiket seçeneği; palette 120 adet.", brand: "Kocaeli Plastik", unit: "adet", kw: ["bidon", "HDPE", "UN onaylı", "kimyasal ambalaj"], img: "/categories/13000000.webp", price: 68, moq: 120, attrs: {"durum": "Sıfır"} },
  { owner: "kocaeli-plastik", name: "Streç Film 17 µ 500 mm (Makine Tipi)", cat: "24122000", catKw: "film", desc: "Makine tipi palet streç film 17 mikron, 500 mm, 1.800 m; %250 ön gerdirme. Koli 6 rulo, kamyon bazında özel fiyat.", brand: "Kocaeli Plastik", unit: "rulo", kw: ["streç film", "palet", "ambalaj"], img: "/categories/24000000.webp", price: 415, moq: 30, attrs: {"durum": "Sıfır"} },
  // izmir-makina
  { owner: "izmir-makina", name: "Paslanmaz Karıştırıcılı Proses Tankı 2.000 L", cat: "23181500", catKw: "tank", desc: "AISI 316L, 2.000 L ceketli karıştırıcılı tank; CIP sprey topu, 0,75 kW redüktörlü karıştırıcı, PT100. Gıda ve kozmetik için, CE/PED.", brand: "İzmir Makina", unit: "adet", kw: ["proses tankı", "paslanmaz tank", "karıştırıcı"], img: "/categories/40000000.webp", moq: 1, attrs: {"durum": "Sıfır", "guc": 0.75, "kontrol": "PLC", "besleme": "380 V trifaze"} },
  { owner: "izmir-makina", name: "Modüler Bant Konveyör (Metre)", cat: "24101500", catKw: "konveyör", desc: "Paslanmaz gövdeli modüler plastik bantlı konveyör, 400–800 mm genişlik, hız kontrollü tahrik. Gıda hattı için yıkanabilir tasarım; metre bazında.", brand: "İzmir Makina", unit: "m", kw: ["konveyör", "bant konveyör", "gıda hattı"], img: "/categories/24000000.webp", price: 38500, moq: 3, attrs: {"durum": "Sıfır", "kapasite": 250, "guc_kaynagi": "Elektrikli"} },
  { owner: "izmir-makina", name: "Vidalı Hava Kompresörü 37 kW 10 bar", cat: "40151600", desc: "37 kW, 10 bar, 6,2 m³/dk vidalı kompresör; invertörlü, entegre kurutucu opsiyonu. Kurulum ve 2 yıl garanti dahil, yedek parça stoğu İzmir.", brand: "AirMax", mpn: "AM-37-10", unit: "adet", kw: ["kompresör", "vidalı kompresör", "basınçlı hava"], img: "/categories/23000000.webp", price: 465000, moq: 1, attrs: {"malzeme": ["Çelik"], "calisma_basinci": 10, "standart": ["ISO", "EN"]} },
  // antalya-tarim
  { owner: "antalya-tarim", name: "Sera Damla Sulama Seti (1 Dönüm)", cat: "21102301", desc: "Bir dönümlük sera için damla sulama seti: 16 mm damlama borusu (20 cm aralık), ana boru, disk filtre, gübre tankı bağlantısı ve vanalar. Kurulum şeması ve yerinde teknik destek dahil; sezon öncesi toplu siparişte indirim.", brand: "Antalya Tarım", unit: "set", kw: ["damla sulama", "sera sulama", "sulama seti"], img: "/categories/21000000.webp", price: 18500, moq: 1, attrs: {"durum": "Sıfır", "makine_tipi": ["Sulama"]} },
  { owner: "antalya-tarim", name: "Akülü Sırt Pülverizatörü 16 L", cat: "21101800", desc: "16 litre depolu akülü sırt pülverizatörü; 12 V 8 Ah akü ile 6 saate kadar çalışma, ayarlanabilir basınç ve çift meme. Sera ve bahçe ilaçlaması için; yedek parça ve servis Antalya'da.", brand: "AgroTek", unit: "adet", kw: ["pülverizatör", "ilaçlama makinesi", "akülü pülverizatör"], img: "/categories/21000000.webp", tiers: [{ minQty: 5, unitPrice: 2450 }, { minQty: 50, unitPrice: 2190 }], moq: 5, attrs: {"durum": "Sıfır", "makine_tipi": ["İlaçlama"]} },
  // trakya-elektrik
  { owner: "trakya-elektrik", name: "NYY Kablo 4x16 mm² (Metre)", cat: "26121600", desc: "0,6/1 kV NYY bakır iletkenli PVC yalıtımlı enerji kablosu 4x16 mm², TSE, 500 m makara. Şantiye teslimi, proje bazında özel fiyat.", brand: "Trakya Elektrik", unit: "m", kw: ["NYY kablo", "enerji kablosu", "4x16"], img: "/categories/26000000.webp", tiers: [{ minQty: 100, unitPrice: 385 }, { minQty: 1000, unitPrice: 362 }], moq: 100, attrs: {"gerilim": "Alçak gerilim (<1 kV)", "durum": "Sıfır", "sertifika": ["CE", "IEC", "TSE"]} },
  { owner: "trakya-elektrik", name: "LED Panel Armatür 60x60 40 W", cat: "39111500", desc: "60x60 cm sıva altı LED panel, 40 W, 4.000 lm, 4000K, UGR<19; ofis ve mağaza aydınlatması. TSE, 3 yıl garanti, koli 4 adet.", brand: "LumiTek", unit: "adet", kw: ["LED panel", "aydınlatma", "60x60"], img: "/categories/39000000.webp", price: 890, moq: 20, attrs: {"gerilim": "Alçak gerilim (<1 kV)", "koruma_sinifi": "IP20", "kullanim_alani": ["Aydınlatma", "Bina teknolojisi"], "guc": 40, "sertifika": ["CE", "RoHS", "TSE"]} },
  { owner: "trakya-elektrik", name: "Sıva Altı Dağıtım Panosu 36 Modül", cat: "39121000", catKw: "pano", desc: "Sıva altı 36 modül metal dağıtım panosu, IP40, şeffaf kapak, bara ve klemens dahil. Konut ve ofis projeleri için, koli 4 adet.", brand: "Trakya Elektrik", unit: "adet", kw: ["dağıtım panosu", "sigorta kutusu", "36 modül"], img: "/categories/39000000.webp", price: 1150, moq: 4, attrs: {"gerilim": "Alçak gerilim (<1 kV)", "koruma_sinifi": "IP44", "kullanim_alani": ["Bina teknolojisi"], "sertifika": ["CE", "TSE"]} },
  // kayseri-mobilya
  { owner: "kayseri-mobilya", name: "Ahşap Otel Oda Kapısı 90x210 cm (Lamine Kaplı)", cat: "30171504", desc: "Masif kasalı, lamine kaplı otel oda kapısı 90x210 cm; 44 mm kanat, 32 dB ses yalıtımı, kartlı kilit hazırlığı ve gizli menteşe. 10 kaplama rengi; proje bazında özel ölçü ve montajlı teslim.", brand: "Kayseri Mobilya", unit: "adet", kw: ["otel kapısı", "ahşap kapı", "oda kapısı"], img: "/categories/30000000.webp", tiers: [{ minQty: 10, unitPrice: 5900 }, { minQty: 100, unitPrice: 5250 }], moq: 10, attrs: {"malzeme": ["Ahşap"], "uygulama": ["İnce yapı"], "standart": ["TSE", "EN"]} },
  { owner: "kayseri-mobilya", name: "Otel Odası Gömme Dolap ve Banko Seti (Proje)", cat: "30161801", desc: "Gömme gardırop, bagaj bankosu, minibar dolabı ve çalışma tezgâhı; otel projeleri için özel ölçü sabit doğrama seti. FSC sertifikalı MDF, laminat ve ahşap kaplama seçenekleri; yerinde montaj dahil.", brand: "Kayseri Mobilya", unit: "set", kw: ["gömme dolap", "otel doğraması", "proje doğraması"], img: "/categories/30000000.webp", moq: 20, attrs: {"malzeme": ["Ahşap"], "uygulama": ["İnce yapı"], "standart": ["TSE"]} },
  // samsun-ambalaj
  { owner: "samsun-ambalaj", name: "Oluklu Koli 40x30x30 cm (5 Katlı)", cat: "14121506", desc: "BC dalga 5 katlı oluklu mukavva koli 40x30x30 cm, 25 kg taşıma. 1 renk flekso baskı dahil; palet 500 adet, özel ölçü 5 gün termin.", brand: "Samsun Ambalaj", unit: "adet", kw: ["oluklu koli", "karton kutu", "5 katlı"], img: "/categories/14000000.webp", tiers: [{ minQty: 500, unitPrice: 28 }, { minQty: 5000, unitPrice: 24.5 }], moq: 500, attrs: {"kagit_tipi": ["Oluklu mukavva"], "form": "Kutu", "geri_donusum": "Geri dönüştürülmüş", "sertifika": ["ISO 9001"]} },
  { owner: "samsun-ambalaj", name: "Fındık İhracat Kolisi 25 kg", cat: "14121506", desc: "Fındık ve kuruyemiş ihracatı için 25 kg kapasiteli 3 katlı koli, nem bariyerli iç kaplama, 2 renk baskı. Haftalık 100 bin adet kapasite.", brand: "Samsun Ambalaj", unit: "adet", kw: ["fındık kolisi", "ihracat ambalajı"], img: "/categories/24000000.webp", price: 19.5, moq: 1000, attrs: {"kagit_tipi": ["Oluklu mukavva", "Kraft"], "form": "Kutu", "sertifika": ["Gıdaya uygun", "ISO 9001"]} },
  // anadolu (hizmet ürünleri)
  { owner: "anadolu", name: "Prefabrik Şantiye Konteyneri 7 m (Kiralık)", cat: "72121400", catKw: "prefabrik", desc: "Ofis ve yatakhane tipi 7 m prefabrik konteyner kiralama; elektrik, klima ve mobilya dahil. Ay bazında, kurulum ve nakliye Türkiye geneli.", brand: "Anadolu", unit: "ay", kw: ["şantiye konteyneri", "prefabrik", "kiralık"], img: "/categories/22000000.webp", price: 6500, moq: 3, attrs: {"hizmet_tipi": ["Yeni yapı"], "proje_olcegi": "Ticari", "kapsam": "Malzeme dahil"} },
  { owner: "anadolu", name: "Endüstriyel Zemin Betonu (Helikopter Perdahlı, m²)", cat: "72121400", catKw: "beton", desc: "Fabrika ve depo zeminleri için çelik lifli C30 beton, yüzey sertleştirici ve helikopter perdah. m² bazında, 7 gün kür sonrası teslim.", brand: "Anadolu", unit: "m²", kw: ["endüstriyel zemin", "perdah beton", "depo zemini"], img: "/categories/72000000.webp", price: 720, moq: 500, attrs: {"hizmet_tipi": ["Yeni yapı", "Zemin işleri"], "proje_olcegi": "Endüstriyel", "kapsam": "Malzeme dahil"} },
  // akdeniz ek
  { owner: "akdeniz", name: "Gümrükleme Hizmeti (Beyanname Başına)", cat: "78131600", catKw: "gümrük", desc: "İthalat ve ihracat gümrük müşavirliği; beyanname, tarife danışmanlığı, Mersin ve Ambarlı limanlarında operasyon. Beyanname başına sabit ücret.", brand: "Akdeniz Lojistik", unit: "adet", kw: ["gümrükleme", "gümrük müşavirliği", "ithalat"], img: "/categories/78000000.webp", price: 2400, moq: 1, attrs: {"tasima_modu": ["Multimodal"], "hizmet_tipi": ["Gümrükleme"], "kapsam": "İthalat", "yetki_belgesi": ["Gümrük müşavirliği"]} },
  // baskent ek
  { owner: "baskent", name: "Numune Kabı 100 ml Steril (500'lü Koli)", cat: "41104100", desc: "Vidalı kapaklı 100 ml polipropilen numune kabı, steril, tekli paket; 500'lük koli. Sızdırmaz kapak ve yazılabilir etiket alanı; su, gıda ve klinik numunelerin alınması ve taşınması için.", brand: "LabSafe", unit: "koli", kw: ["numune kabı", "steril kap", "laboratuvar sarf"], img: "/categories/41000000.webp", tiers: [{ minQty: 4, unitPrice: 1450 }, { minQty: 40, unitPrice: 1290 }], moq: 4, attrs: {"durum": "Sıfır", "kullanim_alani": ["Gıda", "Çevre", "Tıbbi tanı"], "sertifika": ["CE"]} },
  // izmir ek
  { owner: "izmir-makina", name: "Plakalı Isı Eşanjörü 150 kW", cat: "40101800", catKw: "eşanjör", desc: "Contalı plakalı ısı eşanjörü 150 kW, AISI 316 plaka, EPDM conta; gıda ve HVAC uygulamaları. Termal hesap ve seçim mühendislik ekibimizce yapılır.", brand: "İzmir Makina", unit: "adet", kw: ["eşanjör", "ısı değiştirici", "plakalı"], img: "/categories/40000000.webp", price: 96000, moq: 1, attrs: {"malzeme": ["Paslanmaz çelik"], "calisma_basinci": 16, "calisma_sicakligi": 120, "standart": ["EN"]} },
  // metal ek
  { owner: "metal", name: "Paslanmaz Sac 304 2B 1,5 mm (1250x2500)", cat: "30264800", catKw: "paslanmaz", desc: "AISI 304 2B yüzey paslanmaz sac 1,5 mm, 1250x2500 mm, PVC koruma filmli. Ton bazında, sertifikalı (3.1 EN 10204); gıda ve mutfak imalatı için.", brand: "İç Anadolu Metal", unit: "adet", kw: ["paslanmaz sac", "304", "2B"], img: "/categories/11000000.webp", price: 4150, moq: 10, attrs: {"malzeme": ["Çelik"], "uygulama": ["İnce yapı"], "standart": ["EN", "ASTM"]} },
  // yildiz ek
  { owner: "yildiz", name: "Termal Yazar Kasa Rulosu 80x80 mm (60'lı Koli)", cat: "14111818", desc: "80 mm genişlik, 80 mm çap termal rulo; 55 g/m², BPA içermez, yaklaşık 80 m sarım. POS ve yazar kasa yazıcılarıyla uyumlu, koli 60 rulo; kurumsal tedarikte aylık fatura ve toplu sipariş indirimi.", brand: "PrintFine", mpn: "PF-T8080", unit: "koli", kw: ["termal rulo", "yazar kasa rulosu", "POS kağıdı"], img: "/categories/14000000.webp", price: 1640, moq: 2, attrs: {"kagit_tipi": ["Birinci hamur"], "gramaj": 55, "form": "Rulo", "sertifika": ["ISO 9001"]} },
];

/* ───────────────────────── İlanlar ───────────────────────── */
export type Item = { name: string; quantity: number; unit: string; targetPrice?: number; img?: string };
export type L = {
  owner: string; type: "ALIM"; title: string; desc: string; cat: string; catKw?: string; items: Item[];
  closesInDays: number; intl?: boolean; deliveryTerm?: "EXW" | "FCA" | "DAP" | "DDP" | "FOB" | "CIF";
  keywords?: string[]; requireAll?: boolean;
};
export const LISTINGS: L[] = [
  { owner: "anadolu", type: "ALIM", closesInDays: 14, cat: "30111500", catKw: "beton", title: "Şantiye için inşaat demiri ve çimento alımı", desc: "Ankara Yenimahalle'deki konut projemiz için 6 aylık demir ve çimento tedariki. Teslimat şantiyeye, aylık partiler hâlinde; TSE belgeli üretici veya yetkili bayi teklifleri değerlendirilecektir.", deliveryTerm: "DAP", keywords: ["inşaat demiri", "çimento", "hazır beton"], requireAll: true,
    items: [{ name: "İnşaat demiri Ø12 (S420)", quantity: 25000, unit: "kg", targetPrice: 26 }, { name: "Portland çimento CEM I 42.5 R (50 kg)", quantity: 800, unit: "torba", targetPrice: 210 }, { name: "Hazır beton C30/37", quantity: 120, unit: "m³", targetPrice: 2400 }] },
  { owner: "ege", type: "ALIM", closesInDays: 10, cat: "11151600", title: "Pamuk ipliği ve reaktif boya tedariki", desc: "Sonbahar üretim planı için Ne 30/1 penye iplik ve reaktif boya alımı. Numune onayı sonrası aylık teslimat; İzmir fabrikaya DAP teslim, 60 gün vade tercih edilir.", deliveryTerm: "DAP", keywords: ["iplik", "reaktif boya", "tekstil kimyasalı"],
    items: [{ name: "Ne 30/1 penye pamuk ipliği", quantity: 5000, unit: "kg" }, { name: "Reaktif boya — lacivert", quantity: 400, unit: "kg" }, { name: "Fikse maddesi", quantity: 200, unit: "kg" }] },
  { owner: "marmara", type: "ALIM", closesInDays: 7, cat: "40141600", title: "Dolum hatları için paslanmaz vana, boru ve pnömatik silindir alımı", desc: "Yaz sezonu siparişleri için dolum ve sterilizasyon hatlarında kullanılacak paslanmaz armatür ve pnömatik malzeme. Gıdaya uygun AISI 304/316, 3.1 malzeme sertifikalı; Bursa fabrikaya haftalık teslimat.", deliveryTerm: "DAP", keywords: ["küresel vana", "paslanmaz boru", "pnömatik silindir"],
    items: [{ name: "Paslanmaz küresel vana DN25 (3 parçalı)", quantity: 300, unit: "adet" }, { name: "Paslanmaz dikişli boru AISI 304 Ø38x1,5", quantity: 1200, unit: "m" }, { name: "Pnömatik silindir ISO 15552 Ø50x100", quantity: 150, unit: "adet" }] },
  { owner: "toros", type: "ALIM", closesInDays: 21, cat: "12352300", catKw: "hidroksit", title: "Endüstriyel kimyasal hammadde tedariki", desc: "Üretim hattımız için dökme ve torbalı kimyasal alımı; analiz sertifikası zorunlu. Adana OSB'ye tanker veya paletli teslimat, aylık çağrılı sevkiyat.", deliveryTerm: "DAP", keywords: ["kostik", "sülfürik asit", "sodyum bikarbonat"],
    items: [{ name: "Kostik soda %99 (pul)", quantity: 3000, unit: "kg" }, { name: "Sülfürik asit %98", quantity: 1500, unit: "L" }, { name: "Sodyum bikarbonat", quantity: 2000, unit: "kg" }] },
  { owner: "karadeniz", type: "ALIM", closesInDays: 18, cat: "39121000", catKw: "trafo", title: "Trafo merkezi için trafo, kablo ve pano alımı", desc: "Samsun'daki 3 MW GES bağlantısı için kuru tip trafo, OG kablo ve kompanzasyon panosu. Teklife tip test raporları ve devreye alma dahil edilmeli.", deliveryTerm: "DDP", keywords: ["kuru tip trafo", "NYY kablo", "kompanzasyon"],
    items: [{ name: "Kuru tip trafo 1000 kVA 34,5/0,4 kV", quantity: 3, unit: "adet" }, { name: "NYY kablo 4x16", quantity: 2000, unit: "m" }, { name: "Kompanzasyon panosu 400 kVAr", quantity: 2, unit: "adet" }] },
  { owner: "baskent", type: "ALIM", closesInDays: 12, cat: "41121800", title: "Laboratuvar sarf malzeme alımı (6 aylık)", desc: "Anlaşmalı laboratuvar grubu için 6 aylık sarf malzeme çerçeve alımı. CE belgesi ve lot bazında analiz sertifikası zorunlu; teslimat Ankara merkez depoya aylık partiler hâlinde.", deliveryTerm: "DAP", keywords: ["pipet ucu", "santrifüj tüpü", "numune kabı", "laboratuvar sarf"], requireAll: true,
    items: [{ name: "Pipet ucu 200 µl (sarı)", quantity: 500000, unit: "adet" }, { name: "Santrifüj tüpü 15 ml (konik, steril)", quantity: 100000, unit: "adet" }, { name: "Numune kabı 100 ml (steril)", quantity: 50000, unit: "adet" }] },
  { owner: "akdeniz", type: "ALIM", closesInDays: 9, cat: "24112700", title: "Depo ekipmanı: palet, transpalet ve streç film", desc: "Yeni açılan 12.000 m² depo için ekipman alımı. Euro palet EPAL damgalı; transpaletler CE belgeli; streç film makine tipi. Mersin'e teslim.", deliveryTerm: "DAP", keywords: ["euro palet", "transpalet", "streç film"],
    items: [{ name: "Euro palet EPAL 80x120", quantity: 2000, unit: "adet" }, { name: "Manuel transpalet 2,5 t", quantity: 10, unit: "adet" }, { name: "Streç film 17 µ 500 mm", quantity: 1500, unit: "rulo" }] },
  { owner: "metal", type: "ALIM", closesInDays: 15, cat: "30264800", catKw: "sac", title: "DKP ve paslanmaz sac, kutu profil alımı", desc: "Aylık üretim için sac ve profil çerçeve alımı; 3.1 sertifika zorunlu. Konya OSB'ye teslim, tonaj bazında fiyat ve termin belirtilmeli.", deliveryTerm: "DAP", keywords: ["DKP sac", "paslanmaz sac", "kutu profil"],
    items: [{ name: "DKP sac 2 mm 1250x2500", quantity: 15000, unit: "kg" }, { name: "Kutu profil 40x40x2", quantity: 3000, unit: "m" }, { name: "Paslanmaz sac 304 1,5 mm", quantity: 4000, unit: "kg" }] },
  { owner: "bursa-oto", type: "ALIM", closesInDays: 20, cat: "31171500", title: "Rulman ve sızdırmazlık elemanları yıllık alımı", desc: "Bakım-onarım ve üretim hatları için yıllık rulman ve keçe alımı; SKF/FAG/NSK veya muadili, orijinal ambalaj. Bursa'ya aylık çağrılı teslim.", deliveryTerm: "DAP", keywords: ["rulman", "keçe", "sızdırmazlık"],
    items: [{ name: "Sabit bilyalı rulman 6205-2RS", quantity: 4000, unit: "adet" }, { name: "Konik makaralı rulman 30206", quantity: 1200, unit: "adet" }, { name: "Yağ keçesi 35x52x7", quantity: 6000, unit: "adet" }] },
  { owner: "kocaeli-plastik", type: "ALIM", closesInDays: 11, cat: "13111000", catKw: "polimer", title: "HDPE ve PET granül hammadde alımı", desc: "Şişirme ve enjeksiyon hatları için aylık granül tedariki; MFI ve gıda temas uygunluk belgesi zorunlu. Kocaeli'ye big-bag veya silobas teslim.", deliveryTerm: "DAP", intl: true, keywords: ["HDPE granül", "PET granül", "hammadde"],
    items: [{ name: "HDPE şişirme granülü (MFI 0,3)", quantity: 60000, unit: "kg" }, { name: "PET granül şişe tipi (IV 0,80)", quantity: 40000, unit: "kg" }] },
  { owner: "izmir-makina", type: "ALIM", closesInDays: 16, cat: "26101100", catKw: "motor", title: "Elektrik motoru ve redüktör alımı (proje)", desc: "Gıda tesisi konveyör projesi için IE3 verimli motorlar ve helisel redüktörler. İzmir'e teslim; teklifte marka, verim sınıfı ve teslim süresi belirtilmeli.", deliveryTerm: "DAP", keywords: ["elektrik motoru", "redüktör", "IE3"],
    items: [{ name: "Asenkron motor 5,5 kW IE3 B3", quantity: 24, unit: "adet" }, { name: "Helisel redüktör i=20", quantity: 24, unit: "adet" }, { name: "Frekans invertörü 5,5 kW", quantity: 24, unit: "adet" }] },
  { owner: "antalya-tarim", type: "ALIM", closesInDays: 8, cat: "14121506", title: "İhracat için karton koli ve plastik kasa alımı", desc: "Sezon başı paketleme malzemesi: 5 kg domates kolisi (baskılı) ve katlanır plastik kasa. Antalya paketleme tesisine teslim, sezon boyu partili sevkiyat.", deliveryTerm: "DAP", keywords: ["karton koli", "plastik kasa", "paketleme"],
    items: [{ name: "Domates kolisi 5 kg (2 renk baskı)", quantity: 300000, unit: "adet" }, { name: "Katlanır plastik kasa 60x40x22", quantity: 12000, unit: "adet" }] },
  { owner: "gunes", type: "ALIM", closesInDays: 13, cat: "47121500", title: "Temizlik makinesi ve sarf malzeme filo alımı", desc: "600 personelli operasyonumuz için zemin yıkama makinesi, endüstriyel süpürge ve aylık sarf alımı. İstanbul merkeze teslim; servis ağı olan markalar tercih.", deliveryTerm: "DAP", keywords: ["zemin yıkama makinesi", "endüstriyel süpürge", "temizlik sarf"],
    items: [{ name: "Binicili zemin yıkama makinesi", quantity: 6, unit: "adet" }, { name: "Endüstriyel ıslak-kuru süpürge", quantity: 25, unit: "adet" }, { name: "Mikrofiber mop (50'li)", quantity: 200, unit: "paket" }] },
  { owner: "mavi", type: "ALIM", closesInDays: 19, cat: "39121011", title: "Sistem odası için kesintisiz güç kaynağı (UPS) ve akü alımı", desc: "Müşteri sahalarındaki sunucu odaları için online UPS ve bakımsız kuru akü alımı. Çift çevrim (online) topoloji, SNMP kartı ve 2 yıl garanti; İstanbul'a teslim, devreye alma ayrı kalemde.", deliveryTerm: "DAP", keywords: ["UPS", "kesintisiz güç kaynağı", "kuru akü"],
    items: [{ name: "Online UPS 10 kVA (1 faz giriş / 1 faz çıkış)", quantity: 12, unit: "adet" }, { name: "Bakımsız kuru akü 12 V 100 Ah", quantity: 240, unit: "adet" }, { name: "Rack tipi PDU 16 A (8 çıkış)", quantity: 40, unit: "adet" }] },
  { owner: "kayseri-mobilya", type: "ALIM", closesInDays: 22, cat: "11121600", catKw: "MDF", title: "MDF, laminat ve kenar bandı alımı (yıllık)", desc: "Otel projeleri için yıllık levha ve kenar bandı çerçeve alımı; FSC sertifikalı ürün tercih edilir. Kayseri fabrikaya aylık teslim, tır bazında fiyat.", deliveryTerm: "DAP", keywords: ["MDF", "laminat", "kenar bandı", "FSC"],
    items: [{ name: "MDF 18 mm 210x280 (FSC)", quantity: 6000, unit: "adet" }, { name: "Laminat kaplı sunta 18 mm", quantity: 4000, unit: "adet" }, { name: "PVC kenar bandı 22x1 mm", quantity: 50000, unit: "m" }] },
  { owner: "trakya-elektrik", type: "ALIM", closesInDays: 6, cat: "39111500", title: "Fabrika aydınlatma projesi için LED armatür alımı", desc: "Çerkezköy'de 8.000 m² üretim alanı LED dönüşümü. Yüksek tavan armatürleri DALI uyumlu, 5 yıl garanti; kurulum ayrı teklif olarak istenebilir.", deliveryTerm: "DAP", keywords: ["LED highbay", "aydınlatma projesi", "DALI"],
    items: [{ name: "LED highbay 150 W 150 lm/W", quantity: 220, unit: "adet" }, { name: "LED etanj armatür 1500 mm 50 W", quantity: 180, unit: "adet" }, { name: "Acil aydınlatma kiti", quantity: 60, unit: "adet" }] },
];

export const BIDS: { bidder: string; owner: string; titleIncludes: string; amount: number }[] = [
  { bidder: "trakya-elektrik", owner: "karadeniz", titleIncludes: "Trafo merkezi", amount: 2450000 },
  { bidder: "demir", owner: "metal", titleIncludes: "DKP", amount: 1290000 },
  { bidder: "izmir-makina", owner: "marmara", titleIncludes: "vana", amount: 615000 },
  { bidder: "samsun-ambalaj", owner: "antalya-tarim", titleIncludes: "karton koli", amount: 8400000 },
  { bidder: "toros", owner: "kocaeli-plastik", titleIncludes: "granül", amount: 5900000 },
  { bidder: "metal", owner: "bursa-oto", titleIncludes: "Rulman", amount: 740000 },
  { bidder: "trakya-elektrik", owner: "izmir-makina", titleIncludes: "motor", amount: 1120000 },
  { bidder: "karadeniz", owner: "mavi", titleIncludes: "kesintisiz güç", amount: 1980000 },
];

/* ───────────────────────── Denetim yardımcıları (saf) ───────────────────────── */

/** Betiğin yazacağı BÜTÜN kategori kodları — gizli segment kapısına verilir. */
export function marketplaceDemoCategoryRefs(): SeedCategoryRef[] {
  return [
    ...COMPANIES.flatMap((c) => [
      ...c.sell.map((code) => ({ source: `company ${c.key} sell`, code })),
      ...c.buy.map((code) => ({ source: `company ${c.key} buy`, code })),
    ]),
    ...PRODUCTS.map((p) => ({ source: `product "${p.name}" (${p.owner})`, code: p.cat })),
    ...LISTINGS.map((l) => ({ source: `listing "${l.title}" (${l.owner})`, code: l.cat })),
  ];
}

/** Firma kapağı: ilk satış segmentinin fotoğrafı (satışı yoksa hizmet segmenti). */
export const companyCoverPhoto = (c: Pick<Co, "sell">) => segmentPhoto(c.sell[0] ?? "81000000");

/** Betiğin kullandığı bütün görsel yolları (ürün + firma kapağı). */
export function marketplaceDemoPhotos(): string[] {
  return [...new Set([...PRODUCTS.map((p) => p.img), ...COMPANIES.map(companyCoverPhoto)])];
}

/**
 * Aynı görseller, gizli segment kapısının başvurusu olarak (ürün başına bir
 * satır: ileti hangi ürünün görselinin gizli segmentte kaldığını söyler).
 * Betik bunları kategori kodlarıyla birlikte `assertVisibleSeedCategories`e verir.
 */
export function marketplaceDemoPhotoRefs(): SeedCategoryRef[] {
  return seedPhotoCategoryRefs([
    ...PRODUCTS.map((p) => ({ source: `product "${p.name}" (${p.owner})`, src: p.img })),
    ...COMPANIES.map((c) => ({ source: `company ${c.key} cover`, src: companyCoverPhoto(c) })),
  ]);
}

/**
 * NİTELİK DENETİMİ — demo ürünlerin `attrs` anahtarları kategori ata
 * zincirindeki matriste TANIMLI olmalı ve kapalı listelerde değer
 * seçeneklerden GELMELİ. Tanımsız bir anahtar sessizce yazılırsa ürün
 * sayfasında Özellikler sekmesi boş kalır, süzgeç o değeri hiç saymaz —
 * yani veri var görünür ama hiçbir yerde işe yaramaz. Boş dizi = uyumlu.
 * Kategorisi değişen ürünün `attrs`ı da YENİ kategorinin matrisine göre
 * yazılır (eski segmentin anahtarları burada "tanımlı değil" diye düşer).
 */
export function demoAttrProblems(products: readonly Pr[] = PRODUCTS): string[] {
  const bad: string[] = [];
  for (const p of products) {
    if (!p.attrs) continue;
    const defs = new Map<string, (typeof CATEGORY_ATTRIBUTES)[string][number]>();
    for (const code of [...categoryAncestors(p.cat), p.cat]) {
      for (const d of CATEGORY_ATTRIBUTES[code] ?? []) defs.set(d.key, d);
    }
    for (const [key, value] of Object.entries(p.attrs)) {
      const def = defs.get(key);
      if (!def) {
        bad.push(`${p.name}: "${key}" niteliği ${p.cat} zincirinde tanımlı değil`);
        continue;
      }
      const values = Array.isArray(value) ? value : [value];
      if (def.type === "SINGLE_SELECT" && Array.isArray(value)) bad.push(`${p.name}: "${key}" tek seçimlik, dizi verildi`);
      if (def.type === "NUMBER" && typeof value !== "number") bad.push(`${p.name}: "${key}" sayı olmalı`);
      for (const v of values) {
        if (def.options && !def.options.includes(String(v))) bad.push(`${p.name}: "${key}" için geçersiz değer "${v}"`);
      }
    }
  }
  return bad;
}
