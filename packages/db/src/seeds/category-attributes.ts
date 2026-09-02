/**
 * KATEGORİ → NİTELİK MATRİSİ — ilk tur (Faz 2).
 *
 * Nitelik = o ürün tipine özel, YAPILANDIRILMIŞ alan. Serbest açıklama değil;
 * süzülebilir, karşılaştırılabilir veri. Alıcının "hangi IP sınıfı?" sorusunu
 * açıklama metnini okumadan yanıtlar.
 *
 * ── NEDEN SEGMENT SEVİYESİNDE ─────────────────────────────────────────────
 * Katalogda 158.018 kategori var. Kod başına nitelik yazmak bitmez. Nitelik
 * ÜST düğümde tanımlanır, altındaki her düğüm DEVRALIR (ata zinciri
 * `categoryAncestors`, @rothern/shared). Bu dosya çoğunlukla L1 segmentte
 * tanımlıyor; bir aile kendine özgü nitelik isterse L2'de üzerine bindirir
 * (örnek: 40170000 borular).
 *
 * ── KAPSAM: 58 SEGMENTİN 58'İ (2026-09-02) ────────────────────────────────
 * İlk tur 14 segmentle başlamıştı; ürün dizini açılınca kalan 44 segment de
 * dolduruldu. Sebep: nitelik tanımlı olmayan bir dalda süzgeç kurulamıyor ve
 * ürün formu o kullanıcıya hiçbir yapılandırılmış soru sormuyordu — yani
 * katalog dolduğu hâlde karşılaştırılabilir veri üretmiyordu.
 *
 * Bir segment yine de boş bırakılabilir: doldurulmamış dalda form nitelik
 * SORMAZ ve akış çalışmaya devam eder. Matris eksikken ürün eklenemez hâle
 * gelmemeli.
 *
 * Derinleştirme (L2/L3 bindirmesi) TALEP GELDİKÇE yapılır: 40170000 (borular)
 * örneği aşağıda. Segment düzeyi tabanı verir, aile düzeyi keskinleştirir.
 *
 * ── SEÇİM LİSTELERİ KAPALI ────────────────────────────────────────────────
 * Mümkün olan her yerde SINGLE/MULTI_SELECT; TEXT son çare çünkü süzülemez.
 * Europages'in sertifika alanını kapalı listeden seçtirmesi tam da bu yüzden:
 * serbest metin filtrelemeyi öldürür ("ISO9001", "ISO 9001", "iso-9001").
 *
 * Grup ANAHTARI (`key`) makine adıdır ve ürünün `attributes` JSON'ında
 * anahtar olarak durur — etiket çevrilse bile veri bozulmasın diye ada göre
 * değil anahtara göre eşleşiriz.
 */

export type AttrType = "SINGLE_SELECT" | "MULTI_SELECT" | "NUMBER" | "TEXT";

export interface AttrDef {
  key: string;
  nameTr: string;
  type: AttrType;
  options?: string[];
  unit?: string;
  required?: boolean;
}

/** Sık tekrar eden değer kümeleri — tek yerde dursun, kopyalanmasın. */
const DURUM: AttrDef = {
  key: "durum",
  nameTr: "Ürün durumu",
  type: "SINGLE_SELECT",
  options: ["Sıfır", "İkinci el", "Yenilenmiş"],
  required: true,
};

const METAL_MALZEME = [
  "Çelik",
  "Paslanmaz çelik",
  "Alüminyum",
  "Bakır",
  "Pirinç",
  "Döküm",
  "Çinko",
  "Titanyum",
];

const STANDART = ["EN", "DIN", "ASTM", "TSE", "ISO", "JIS", "GOST"];

/**
 * `DURUM` zorunlu; hizmet ve lisans gibi "sıfır/ikinci el" sorusunun anlamsız
 * olduğu yerlerde bu opsiyonel varyant kullanılır. Zorunlu bir alanı anlamsız
 * olduğu yerde sormak, kullanıcıyı rastgele bir değer seçmeye iter.
 */
const DURUM_OPSIYONEL: AttrDef = { ...DURUM, required: false };

/** Hizmet segmentlerinin ortak ekseni: iş NASIL satılıyor. */
const SERVIS_MODELI: AttrDef = {
  key: "calisma_modeli",
  nameTr: "Çalışma modeli",
  type: "SINGLE_SELECT",
  options: [
    "Proje bazlı",
    "Sözleşmeli (periyodik)",
    "Saatlik / gündelik",
    "Anahtar teslim",
    "Danışmanlık",
  ],
  required: true,
};

/** Hizmet NEREDE veriliyor — lojistik uygunluğun tek soruluk hâli. */
const CALISMA_BICIMI: AttrDef = {
  key: "calisma_bicimi",
  nameTr: "Çalışma biçimi",
  type: "SINGLE_SELECT",
  options: ["Yerinde", "Uzaktan", "Karma"],
};

const YUZEY = [
  "Ham",
  "Galvaniz",
  "Boyalı",
  "Parlatılmış",
  "Anodize",
  "Kaplamalı",
  "Elektrostatik toz boya",
];

export const CATEGORY_ATTRIBUTES: Record<string, AttrDef[]> = {
  // ── 11 · Metaller, Mineraller, Tekstil ve Doğal Malzemeler ──
  "11000000": [
    { key: "malzeme", nameTr: "Malzeme", type: "MULTI_SELECT", options: METAL_MALZEME, required: true },
    {
      key: "form",
      nameTr: "Form",
      type: "SINGLE_SELECT",
      options: ["Levha", "Rulo", "Bar / Çubuk", "Boru", "Profil", "Tel", "Toz", "Külçe", "Hurda"],
      required: true,
    },
    { key: "kalinlik", nameTr: "Kalınlık", type: "NUMBER", unit: "mm" },
    { key: "standart", nameTr: "Standart", type: "MULTI_SELECT", options: STANDART },
    { key: "yuzey", nameTr: "Yüzey işlemi", type: "MULTI_SELECT", options: YUZEY },
  ],

  // ── 12 · Kimyasal Maddeler ──
  "12000000": [
    {
      key: "fiziksel_hal",
      nameTr: "Fiziksel hâl",
      type: "SINGLE_SELECT",
      options: ["Katı", "Sıvı", "Gaz", "Toz", "Granül", "Pasta"],
      required: true,
    },
    { key: "saflik", nameTr: "Saflık", type: "NUMBER", unit: "%" },
    {
      key: "ambalaj",
      nameTr: "Ambalaj",
      type: "MULTI_SELECT",
      options: ["Bidon", "Varil", "IBC tank", "Torba", "Big-bag", "Dökme", "Tüp"],
    },
    {
      key: "tehlike",
      nameTr: "Tehlike sınıfı",
      type: "MULTI_SELECT",
      options: ["Tehlikesiz", "Yanıcı", "Aşındırıcı", "Toksik", "Oksitleyici", "Çevreye zararlı"],
    },
    {
      key: "sertifika",
      nameTr: "Sertifika",
      type: "MULTI_SELECT",
      options: ["REACH", "ISO 9001", "GMP", "Helal", "Kosher", "SDS mevcut"],
    },
  ],

  // ── 23 · Endüstriyel Üretim ve İşleme Makineleri ──
  "23000000": [
    DURUM,
    { key: "guc", nameTr: "Motor gücü", type: "NUMBER", unit: "kW" },
    {
      key: "kontrol",
      nameTr: "Kontrol tipi",
      type: "SINGLE_SELECT",
      options: ["CNC", "PLC", "Yarı otomatik", "Manuel"],
    },
    { key: "uretim_yili", nameTr: "Üretim yılı", type: "NUMBER" },
    {
      key: "besleme",
      nameTr: "Besleme gerilimi",
      type: "SINGLE_SELECT",
      options: ["220 V monofaze", "380 V trifaze", "Diğer"],
    },
  ],

  // ── 24 · Malzeme Elleçleme, Koşullama ve Depolama ──
  "24000000": [
    DURUM,
    { key: "kapasite", nameTr: "Taşıma kapasitesi", type: "NUMBER", unit: "kg" },
    { key: "yukseklik", nameTr: "Çalışma yüksekliği", type: "NUMBER", unit: "m" },
    {
      key: "guc_kaynagi",
      nameTr: "Güç kaynağı",
      type: "SINGLE_SELECT",
      options: ["Elektrikli", "Dizel", "LPG", "Hibrit", "Manuel"],
    },
  ],

  // ── 27 · Aletler ve Genel Makineler ──
  "27000000": [
    DURUM,
    {
      key: "tahrik",
      nameTr: "Tahrik tipi",
      type: "SINGLE_SELECT",
      options: ["El aleti", "Elektrikli", "Akülü", "Pnömatik", "Hidrolik"],
      required: true,
    },
    { key: "guc", nameTr: "Güç", type: "NUMBER", unit: "W" },
  ],

  // ── 30 · İnşaat Malzemeleri ──
  "30000000": [
    {
      key: "malzeme",
      nameTr: "Malzeme",
      type: "MULTI_SELECT",
      options: ["Beton", "Çelik", "Ahşap", "Alçı", "Seramik", "Cam", "Yalıtım", "PVC", "Alüminyum"],
      required: true,
    },
    {
      key: "uygulama",
      nameTr: "Uygulama alanı",
      type: "MULTI_SELECT",
      options: ["Kaba yapı", "İnce yapı", "Cephe", "Çatı", "Zemin", "Tesisat", "Peyzaj"],
    },
    {
      key: "yangin_sinifi",
      nameTr: "Yangın sınıfı",
      type: "SINGLE_SELECT",
      options: ["A1", "A2", "B", "C", "D", "E", "F"],
    },
    { key: "standart", nameTr: "Standart", type: "MULTI_SELECT", options: STANDART },
  ],

  // ── 31 · Üretim Bileşenleri ve Tedarikçileri ──
  "31000000": [
    {
      key: "imalat_yontemi",
      nameTr: "İmalat yöntemi",
      type: "MULTI_SELECT",
      options: [
        "Talaşlı imalat",
        "Döküm",
        "Dövme",
        "Sac işleme",
        "Enjeksiyon",
        "Ekstrüzyon",
        "Kaynak",
        "3D baskı",
      ],
      required: true,
    },
    { key: "malzeme", nameTr: "Malzeme", type: "MULTI_SELECT", options: [...METAL_MALZEME, "Plastik", "Kompozit"] },
    { key: "tolerans", nameTr: "Tolerans", type: "TEXT" },
    { key: "yuzey", nameTr: "Yüzey işlemi", type: "MULTI_SELECT", options: YUZEY },
  ],

  // ── 39 · Elektrik Sistemleri ve Aydınlatma ──
  "39000000": [
    {
      key: "gerilim",
      nameTr: "Gerilim aralığı",
      type: "SINGLE_SELECT",
      options: ["Alçak gerilim (<1 kV)", "Orta gerilim (1-36 kV)", "Yüksek gerilim (>36 kV)"],
      required: true,
    },
    {
      key: "koruma_sinifi",
      nameTr: "Koruma sınıfı (IP)",
      type: "SINGLE_SELECT",
      options: ["IP20", "IP44", "IP54", "IP55", "IP65", "IP66", "IP67", "IP68"],
    },
    {
      key: "kullanim_alani",
      nameTr: "Kullanım alanı",
      type: "MULTI_SELECT",
      options: ["Sanayi", "Bina teknolojisi", "Enerji dağıtımı", "Aydınlatma", "Otomasyon", "Yenilenebilir enerji"],
    },
    { key: "guc", nameTr: "Güç", type: "NUMBER", unit: "W" },
    {
      key: "sertifika",
      nameTr: "Sertifika",
      type: "MULTI_SELECT",
      options: ["CE", "TSE", "UL", "IEC", "RoHS", "ATEX"],
    },
  ],

  // ── 40 · Dağıtım ve Koşullama Sistemleri ──
  "40000000": [
    {
      key: "malzeme",
      nameTr: "Malzeme",
      type: "MULTI_SELECT",
      options: ["Çelik", "Paslanmaz çelik", "Döküm", "Bakır", "PVC", "PPRC", "PE", "Kompozit"],
      required: true,
    },
    { key: "calisma_basinci", nameTr: "Çalışma basıncı", type: "NUMBER", unit: "bar" },
    { key: "calisma_sicakligi", nameTr: "Çalışma sıcaklığı", type: "NUMBER", unit: "°C" },
    { key: "standart", nameTr: "Standart", type: "MULTI_SELECT", options: STANDART },
  ],
  // L2 ÜZERİNE BİNDİRME örneği: borular, segmentten gelen dördü DEVRALIR ve
  // kendine özgü üçünü ekler. Miras böyle çalışıyor.
  "40170000": [
    { key: "capi", nameTr: "Anma çapı (DN)", type: "NUMBER", unit: "mm", required: true },
    { key: "et_kalinligi", nameTr: "Et kalınlığı", type: "NUMBER", unit: "mm" },
    {
      key: "baglanti",
      nameTr: "Bağlantı tipi",
      type: "SINGLE_SELECT",
      options: ["Kaynaklı", "Flanşlı", "Dişli", "Geçmeli", "Kelepçeli", "Füzyon"],
    },
    {
      key: "uretim_yontemi",
      nameTr: "Üretim yöntemi",
      type: "SINGLE_SELECT",
      options: ["Dikişsiz", "Dikişli (ERW)", "Spiral kaynaklı", "Ekstrüzyon"],
    },
  ],

  // ── 41 · Laboratuvar Ekipmanı ──
  "41000000": [
    DURUM,
    {
      key: "kullanim_alani",
      nameTr: "Kullanım alanı",
      type: "MULTI_SELECT",
      options: ["Analitik kimya", "Mikrobiyoloji", "Gıda", "Tıbbi tanı", "Çevre", "Malzeme testi"],
    },
    {
      key: "sertifika",
      nameTr: "Sertifika",
      type: "MULTI_SELECT",
      options: ["CE", "IVD", "ISO 17025", "GLP"],
    },
  ],

  // ── 50 · Gıda ve İçecek Ürünleri ──
  "50000000": [
    {
      key: "sertifika",
      nameTr: "Sertifika",
      type: "MULTI_SELECT",
      options: ["Helal", "Kosher", "Organik", "ISO 22000", "HACCP", "BRC", "IFS", "GlobalGAP"],
      required: true,
    },
    {
      key: "saklama",
      nameTr: "Saklama koşulu",
      type: "SINGLE_SELECT",
      options: ["Oda sıcaklığı", "Soğuk zincir (0-4 °C)", "Dondurulmuş (-18 °C)", "Kuru ve serin"],
      required: true,
    },
    {
      key: "ambalaj",
      nameTr: "Ambalaj",
      type: "MULTI_SELECT",
      options: ["Kutu", "Poşet", "Cam kavanoz", "Teneke", "Vakumlu", "Big-bag", "Dökme"],
    },
    { key: "raf_omru", nameTr: "Raf ömrü", type: "NUMBER", unit: "ay" },
  ],

  // ── 53 · Giyim, Çanta-Bavul ve Kişisel Bakım ──
  "53000000": [
    {
      key: "kumas",
      nameTr: "Kumaş / malzeme",
      type: "MULTI_SELECT",
      options: ["Pamuk", "Polyester", "Yün", "Keten", "Viskon", "Denim", "Deri", "Karışım"],
      required: true,
    },
    {
      key: "uretim_tipi",
      nameTr: "Üretim tipi",
      type: "SINGLE_SELECT",
      options: ["Fason üretim", "Kendi markası", "Özel tasarım (private label)", "Stok fazlası"],
      required: true,
    },
    { key: "beden_araligi", nameTr: "Beden aralığı", type: "TEXT" },
    {
      key: "sertifika",
      nameTr: "Sertifika",
      type: "MULTI_SELECT",
      options: ["OEKO-TEX", "GOTS", "BCI", "GRS"],
    },
  ],

  // ── 72 · Bina ve Tesis İnşaat ve Bakım Hizmetleri ──
  "72000000": [
    {
      key: "hizmet_tipi",
      nameTr: "Hizmet tipi",
      type: "MULTI_SELECT",
      options: ["Yeni yapı", "Tadilat", "Restorasyon", "Bakım-onarım", "Yıkım", "Zemin işleri"],
      required: true,
    },
    {
      key: "proje_olcegi",
      nameTr: "Proje ölçeği",
      type: "SINGLE_SELECT",
      options: ["Konut", "Ticari", "Endüstriyel", "Altyapı", "Kamu"],
    },
    {
      key: "kapsam",
      nameTr: "Kapsam",
      type: "SINGLE_SELECT",
      options: ["Anahtar teslim", "Malzeme dahil", "Sadece işçilik", "Taşeronluk"],
    },
  ],

  // ── 73 · Endüstriyel Üretim Hizmetleri (fason) ──
  "73000000": [
    {
      key: "hizmet",
      nameTr: "Verilen hizmet",
      type: "MULTI_SELECT",
      options: [
        "Talaşlı imalat",
        "Kaynak",
        "Sac işleme",
        "Isıl işlem",
        "Yüzey kaplama",
        "Montaj",
        "Boyama",
        "Kalıp imalatı",
      ],
      required: true,
    },
    {
      key: "parti_buyuklugu",
      nameTr: "Parti büyüklüğü",
      type: "SINGLE_SELECT",
      options: ["Numune / prototip", "Küçük parti (<100)", "Orta parti (100-1000)", "Seri üretim (>1000)"],
      required: true,
    },
    { key: "tolerans", nameTr: "Çalışılan tolerans", type: "TEXT" },
    { key: "malzeme", nameTr: "İşlenen malzeme", type: "MULTI_SELECT", options: [...METAL_MALZEME, "Plastik", "Kompozit"] },
  ],

  // ── 10 · Canlı Bitkiler, Hayvanlar ve Sarf Malzemeleri ──
  "10000000": [
    {
      key: "urun_grubu",
      nameTr: "Ürün grubu",
      type: "SINGLE_SELECT",
      options: ["Süs bitkisi", "Fide / fidan", "Tohum", "Kesme çiçek", "Canlı hayvan", "Yem", "Gübre"],
      required: true,
    },
    {
      key: "uretim_bicimi",
      nameTr: "Üretim biçimi",
      type: "SINGLE_SELECT",
      options: ["Konvansiyonel", "Organik", "Sera", "Açık alan"],
    },
    {
      key: "saklama",
      nameTr: "Taşıma / saklama",
      type: "SINGLE_SELECT",
      options: ["Oda sıcaklığı", "Soğuk zincir", "Canlı taşıma"],
    },
    {
      key: "sertifika",
      nameTr: "Sertifika",
      type: "MULTI_SELECT",
      options: ["Organik sertifikası", "GlobalGAP", "Fitosaniter sertifika", "Veteriner sağlık sertifikası"],
    },
  ],

  // ── 13 · Reçine, Kauçuk ve Elastomerler ──
  "13000000": [
    {
      key: "polimer",
      nameTr: "Polimer tipi",
      type: "MULTI_SELECT",
      options: ["PE", "PP", "PVC", "PET", "PS", "ABS", "PA (naylon)", "POM", "PU", "Silikon", "EPDM", "NBR", "Doğal kauçuk"],
      required: true,
    },
    {
      key: "form",
      nameTr: "Form",
      type: "SINGLE_SELECT",
      options: ["Granül", "Toz", "Levha", "Profil", "Film", "Sıvı", "Masterbatch"],
      required: true,
    },
    { key: "sertlik", nameTr: "Sertlik", type: "NUMBER", unit: "Shore A" },
    {
      key: "geri_donusum",
      nameTr: "Hammadde kaynağı",
      type: "SINGLE_SELECT",
      options: ["Orijinal (virgin)", "Geri dönüştürülmüş", "Karışım"],
    },
    { key: "standart", nameTr: "Standart", type: "MULTI_SELECT", options: STANDART },
  ],

  // ── 14 · Kağıt Ürünler ve Malzemeler ──
  "14000000": [
    {
      key: "kagit_tipi",
      nameTr: "Kağıt tipi",
      type: "MULTI_SELECT",
      options: ["Kraft", "Oluklu mukavva", "Kuşe", "Birinci hamur", "Gazete kağıdı", "Temizlik kağıdı", "Karton"],
      required: true,
    },
    { key: "gramaj", nameTr: "Gramaj", type: "NUMBER", unit: "g/m²" },
    {
      key: "form",
      nameTr: "Form",
      type: "SINGLE_SELECT",
      options: ["Bobin", "Tabaka", "Rulo", "Kutu"],
    },
    {
      key: "geri_donusum",
      nameTr: "Hammadde kaynağı",
      type: "SINGLE_SELECT",
      options: ["Birinci hamur", "Geri dönüştürülmüş", "Karışım"],
    },
    {
      key: "sertifika",
      nameTr: "Sertifika",
      type: "MULTI_SELECT",
      options: ["FSC", "PEFC", "ISO 9001", "Gıdaya uygun"],
    },
  ],

  // ── 15 · Yakıtlar, Katkı Maddeleri ve Kayganlaştırıcılar ──
  "15000000": [
    {
      key: "urun_tipi",
      nameTr: "Ürün tipi",
      type: "SINGLE_SELECT",
      options: ["Akaryakıt", "Madeni yağ", "Gres", "Katkı maddesi", "LPG / LNG", "Katı yakıt", "Biyoyakıt"],
      required: true,
    },
    { key: "viskozite", nameTr: "Viskozite sınıfı", type: "TEXT" },
    { key: "parlama_noktasi", nameTr: "Parlama noktası", type: "NUMBER", unit: "°C" },
    {
      key: "ambalaj",
      nameTr: "Ambalaj",
      type: "MULTI_SELECT",
      options: ["Varil", "Bidon", "IBC tank", "Tüp", "Dökme"],
    },
    {
      key: "standart",
      nameTr: "Standart",
      type: "MULTI_SELECT",
      options: ["API", "ACEA", "SAE", "ISO", "TSE", "EPDK lisanslı"],
    },
  ],

  // ── 20 · Madencilik ve Sondaj Makineleri ──
  "20000000": [
    DURUM,
    {
      key: "makine_tipi",
      nameTr: "Makine tipi",
      type: "MULTI_SELECT",
      options: ["Delici", "Kırıcı", "Öğütücü", "Eleme", "Yıkama", "Konveyör", "Sondaj kulesi"],
      required: true,
    },
    { key: "kapasite", nameTr: "Kapasite", type: "NUMBER", unit: "ton/saat" },
    { key: "guc", nameTr: "Motor gücü", type: "NUMBER", unit: "kW" },
    { key: "uretim_yili", nameTr: "Üretim yılı", type: "NUMBER" },
  ],

  // ── 21 · Tarım ve Balıkçılık Makineleri ──
  "21000000": [
    DURUM,
    {
      key: "makine_tipi",
      nameTr: "Makine tipi",
      type: "MULTI_SELECT",
      options: [
        "Traktör",
        "Toprak işleme",
        "Ekim / dikim",
        "İlaçlama",
        "Hasat",
        "Sulama",
        "Yem hazırlama",
        "Süt sağım",
        "Balıkçılık ekipmanı",
      ],
      required: true,
    },
    { key: "guc", nameTr: "Motor gücü", type: "NUMBER", unit: "HP" },
    { key: "calisma_genisligi", nameTr: "Çalışma genişliği", type: "NUMBER", unit: "m" },
    { key: "uretim_yili", nameTr: "Üretim yılı", type: "NUMBER" },
  ],

  // ── 22 · Ağır İş Ekipmanı ──
  "22000000": [
    DURUM,
    {
      key: "ekipman_tipi",
      nameTr: "Ekipman tipi",
      type: "MULTI_SELECT",
      options: ["Ekskavatör", "Yükleyici", "Dozer", "Greyder", "Silindir", "Vinç", "Kule vinç", "Beton pompası"],
      required: true,
    },
    { key: "operasyon_agirligi", nameTr: "Operasyon ağırlığı", type: "NUMBER", unit: "ton" },
    { key: "calisma_saati", nameTr: "Çalışma saati", type: "NUMBER", unit: "saat" },
    { key: "uretim_yili", nameTr: "Üretim yılı", type: "NUMBER" },
  ],

  // ── 25 · Araçlar, Aksesuarları ve Bileşenleri ──
  "25000000": [
    DURUM,
    {
      key: "arac_tipi",
      nameTr: "Araç tipi",
      type: "SINGLE_SELECT",
      options: [
        "Binek",
        "Hafif ticari",
        "Kamyon / çekici",
        "Otobüs / midibüs",
        "Römork / dorse",
        "Motosiklet",
        "Yedek parça",
      ],
      required: true,
    },
    {
      key: "yakit",
      nameTr: "Yakıt tipi",
      type: "SINGLE_SELECT",
      options: ["Dizel", "Benzin", "LPG", "Elektrik", "Hibrit"],
    },
    { key: "km", nameTr: "Kilometre", type: "NUMBER", unit: "km" },
    { key: "model_yili", nameTr: "Model yılı", type: "NUMBER" },
  ],

  // ── 26 · Güç Üretim ve Dağıtımı ──
  "26000000": [
    {
      key: "kaynak",
      nameTr: "Enerji kaynağı",
      type: "SINGLE_SELECT",
      options: ["Dizel jeneratör", "Doğal gaz", "Güneş (PV)", "Rüzgâr", "Hidroelektrik", "Biyogaz", "Batarya / depolama"],
      required: true,
    },
    { key: "guc", nameTr: "Güç", type: "NUMBER", unit: "kVA" },
    {
      key: "gerilim",
      nameTr: "Gerilim aralığı",
      type: "SINGLE_SELECT",
      options: ["Alçak gerilim (<1 kV)", "Orta gerilim (1-36 kV)", "Yüksek gerilim (>36 kV)"],
    },
    DURUM_OPSIYONEL,
    {
      key: "sertifika",
      nameTr: "Sertifika",
      type: "MULTI_SELECT",
      options: ["CE", "IEC", "TSE", "ISO 9001"],
    },
  ],

  // ── 32 · Elektronik Bileşenler ve Sarf Malzemeleri ──
  "32000000": [
    {
      key: "bilesen_tipi",
      nameTr: "Bileşen tipi",
      type: "MULTI_SELECT",
      options: ["Pasif bileşen", "Yarı iletken", "Konnektör", "PCB", "Sensör", "Ekran", "Güç modülü", "Kablo / harness"],
      required: true,
    },
    {
      key: "montaj",
      nameTr: "Montaj tipi",
      type: "SINGLE_SELECT",
      options: ["SMD", "THT", "Modül", "Kart"],
    },
    { key: "calisma_gerilimi", nameTr: "Çalışma gerilimi", type: "NUMBER", unit: "V" },
    {
      key: "sertifika",
      nameTr: "Sertifika",
      type: "MULTI_SELECT",
      options: ["RoHS", "REACH", "CE", "UL", "IPC"],
    },
  ],

  // ── 42 · Tıp ──
  "42000000": [
    {
      key: "cihaz_sinifi",
      nameTr: "Cihaz sınıfı",
      type: "SINGLE_SELECT",
      options: ["Sınıf I", "Sınıf IIa", "Sınıf IIb", "Sınıf III"],
      required: true,
    },
    {
      key: "sertifika",
      nameTr: "Belge / kayıt",
      type: "MULTI_SELECT",
      options: ["CE (MDR)", "ISO 13485", "FDA", "ÜTS kayıtlı"],
      required: true,
    },
    {
      key: "kullanim",
      nameTr: "Kullanım",
      type: "SINGLE_SELECT",
      options: ["Tek kullanımlık", "Tekrar kullanılabilir"],
    },
    {
      key: "sterilizasyon",
      nameTr: "Sterilizasyon",
      type: "SINGLE_SELECT",
      options: ["Steril (EO)", "Steril (gama)", "Steril değil"],
    },
    {
      key: "kullanim_alani",
      nameTr: "Kullanım alanı",
      type: "MULTI_SELECT",
      options: ["Cerrahi", "Tanı", "Yoğun bakım", "Diş hekimliği", "Görüntüleme", "Ortopedi", "Sarf malzeme"],
    },
  ],

  // ── 43 · Bilgisayar Donanımı, Yazılım ve Telekom ──
  "43000000": [
    {
      key: "kategori",
      nameTr: "Kategori",
      type: "SINGLE_SELECT",
      options: ["Donanım", "Yazılım", "Ağ / telekom", "Bulut hizmeti", "Aksesuar / sarf"],
      required: true,
    },
    {
      key: "lisans_modeli",
      nameTr: "Lisans modeli",
      type: "SINGLE_SELECT",
      options: ["Kalıcı lisans", "Abonelik", "Açık kaynak", "Kullanım başına"],
    },
    DURUM_OPSIYONEL,
    {
      key: "destek",
      nameTr: "Garanti / destek",
      type: "SINGLE_SELECT",
      options: ["Yok", "1 yıl", "2 yıl", "3 yıl ve üzeri", "Sözleşmeli destek"],
    },
  ],

  // ── 44 · Ofis Ekipmanı ve Sarf Malzemeleri ──
  "44000000": [
    {
      key: "urun_grubu",
      nameTr: "Ürün grubu",
      type: "MULTI_SELECT",
      options: ["Kırtasiye", "Yazıcı ve sarf", "Ofis makinesi", "Arşivleme", "Sunum", "Paketleme"],
      required: true,
    },
    DURUM_OPSIYONEL,
    { key: "koli_adedi", nameTr: "Koli içi adet", type: "NUMBER", unit: "adet" },
    { key: "uyumluluk", nameTr: "Marka / model uyumluluğu", type: "TEXT" },
  ],

  // ── 45 · Baskı, Fotoğraf ve Ses-Video ──
  "45000000": [
    {
      key: "ekipman_tipi",
      nameTr: "Ekipman tipi",
      type: "MULTI_SELECT",
      options: ["Baskı makinesi", "Fotoğraf ekipmanı", "Ses sistemi", "Görüntü / video", "Sahne ışık"],
      required: true,
    },
    {
      key: "baski_teknolojisi",
      nameTr: "Baskı teknolojisi",
      type: "SINGLE_SELECT",
      options: ["Ofset", "Dijital", "Serigrafi", "Flekso", "Tampon", "UV"],
    },
    { key: "maksimum_ebat", nameTr: "Maksimum ebat", type: "TEXT" },
    DURUM_OPSIYONEL,
  ],

  // ── 46 · Kolluk, Ulusal Güvenlik ve Emniyet Ekipmanları ──
  "46000000": [
    {
      key: "urun_grubu",
      nameTr: "Ürün grubu",
      type: "MULTI_SELECT",
      options: ["Kişisel koruyucu donanım", "Yangın güvenliği", "Güvenlik sistemleri", "İş güvenliği", "Acil durum"],
      required: true,
    },
    {
      key: "sertifika",
      nameTr: "Sertifika",
      type: "MULTI_SELECT",
      options: ["CE", "EN standardı", "TSE", "ISO 45001"],
      required: true,
    },
    { key: "koruma_seviyesi", nameTr: "Koruma seviyesi", type: "TEXT" },
    {
      key: "kullanim_alani",
      nameTr: "Kullanım alanı",
      type: "MULTI_SELECT",
      options: ["Endüstriyel", "İnşaat", "Sağlık", "Gıda", "Kamu"],
    },
  ],

  // ── 47 · Temizlik Malzemeleri ──
  "47000000": [
    {
      key: "urun_tipi",
      nameTr: "Ürün tipi",
      type: "MULTI_SELECT",
      options: ["Genel temizlik", "Endüstriyel kimyasal", "Hijyenik kağıt", "Ekipman / makine", "Dezenfektan"],
      required: true,
    },
    {
      key: "konsantrasyon",
      nameTr: "Konsantrasyon",
      type: "SINGLE_SELECT",
      options: ["Konsantre", "Kullanıma hazır"],
    },
    {
      key: "ambalaj",
      nameTr: "Ambalaj",
      type: "MULTI_SELECT",
      options: ["Şişe", "Bidon", "Varil", "IBC tank", "Koli"],
    },
    {
      key: "sertifika",
      nameTr: "Sertifika / ruhsat",
      type: "MULTI_SELECT",
      options: ["Biyosidal ruhsatı", "ISO 9001", "Ecolabel", "Gıda temasına uygun"],
    },
  ],

  // ── 48 · Hizmet Sektörü Ekipmanı ──
  "48000000": [
    {
      key: "kullanim_alani",
      nameTr: "Kullanım alanı",
      type: "MULTI_SELECT",
      options: ["Endüstriyel mutfak", "Otel / konaklama", "Kafe - restoran", "Market / perakende", "Çamaşırhane"],
      required: true,
    },
    DURUM,
    { key: "kapasite", nameTr: "Kapasite", type: "TEXT" },
    {
      key: "guc_kaynagi",
      nameTr: "Güç kaynağı",
      type: "SINGLE_SELECT",
      options: ["Elektrikli", "Doğal gaz", "LPG", "Buhar"],
    },
  ],

  // ── 49 · Spor Malzemeleri ──
  "49000000": [
    {
      key: "urun_grubu",
      nameTr: "Ürün grubu",
      type: "MULTI_SELECT",
      options: ["Fitness ekipmanı", "Takım sporları", "Outdoor", "Su sporları", "Oyun alanı"],
      required: true,
    },
    {
      key: "kullanim",
      nameTr: "Kullanım sınıfı",
      type: "SINGLE_SELECT",
      options: ["Ev tipi", "Kulüp / profesyonel", "Ticari salon"],
    },
    { key: "malzeme", nameTr: "Malzeme", type: "TEXT" },
    DURUM_OPSIYONEL,
  ],

  // ── 51 · İlaç Ürünleri ──
  "51000000": [
    {
      key: "urun_tipi",
      nameTr: "Ürün tipi",
      type: "SINGLE_SELECT",
      options: ["Beşeri ilaç", "Veteriner ilaç", "Etken madde (API)", "Takviye edici gıda", "Dermokozmetik"],
      required: true,
    },
    {
      key: "ruhsat",
      nameTr: "Ruhsat / belge",
      type: "MULTI_SELECT",
      options: ["TİTCK ruhsatlı", "GMP", "EU-GMP", "FDA"],
      required: true,
    },
    {
      key: "form",
      nameTr: "Farmasötik form",
      type: "SINGLE_SELECT",
      options: ["Tablet", "Kapsül", "Şurup", "Ampul / flakon", "Krem / merhem", "Toz"],
    },
    {
      key: "saklama",
      nameTr: "Saklama koşulu",
      type: "SINGLE_SELECT",
      options: ["Oda sıcaklığı", "Soğuk zincir (2-8 °C)", "Dondurulmuş"],
    },
    { key: "raf_omru", nameTr: "Raf ömrü", type: "NUMBER", unit: "ay" },
  ],

  // ── 52 · Tüketici Elektroniği ──
  "52000000": [
    {
      key: "urun_grubu",
      nameTr: "Ürün grubu",
      type: "MULTI_SELECT",
      options: ["Beyaz eşya", "Küçük ev aleti", "TV / görüntü", "Ses sistemi", "Mobil cihaz", "Aksesuar"],
      required: true,
    },
    DURUM,
    { key: "garanti", nameTr: "Garanti süresi", type: "NUMBER", unit: "ay" },
    {
      key: "enerji_sinifi",
      nameTr: "Enerji sınıfı",
      type: "SINGLE_SELECT",
      options: ["A", "B", "C", "D", "E", "F", "G"],
    },
    {
      key: "sertifika",
      nameTr: "Sertifika",
      type: "MULTI_SELECT",
      options: ["CE", "TSE", "RoHS", "Enerji etiketi"],
    },
  ],

  // ── 54 · Takılar ──
  "54000000": [
    {
      key: "malzeme",
      nameTr: "Malzeme",
      type: "MULTI_SELECT",
      options: ["Altın", "Gümüş", "Platin", "Çelik", "Pirinç", "Kaplama", "Doğal taş"],
      required: true,
    },
    {
      key: "ayar",
      nameTr: "Ayar",
      type: "SINGLE_SELECT",
      options: ["8 ayar", "14 ayar", "18 ayar", "22 ayar", "24 ayar", "925 gümüş"],
    },
    {
      key: "uretim_tipi",
      nameTr: "Üretim tipi",
      type: "SINGLE_SELECT",
      options: ["Fason üretim", "Kendi markası", "El işçiliği", "Seri üretim"],
    },
    {
      key: "sertifika",
      nameTr: "Belge",
      type: "MULTI_SELECT",
      options: ["Ayar damgası", "Kimberley süreci", "Sorumlu tedarik"],
    },
  ],

  // ── 55 · Yayınlanmış Ürünler ──
  "55000000": [
    {
      key: "urun_tipi",
      nameTr: "Ürün tipi",
      type: "MULTI_SELECT",
      options: ["Kitap", "Dergi", "Katalog / broşür", "Takvim", "Harita", "Ambalaj baskısı"],
      required: true,
    },
    {
      key: "baski_teknolojisi",
      nameTr: "Baskı teknolojisi",
      type: "SINGLE_SELECT",
      options: ["Ofset", "Dijital", "Serigrafi"],
    },
    {
      key: "cilt",
      nameTr: "Cilt tipi",
      type: "SINGLE_SELECT",
      options: ["Karton kapak", "Sert kapak", "Spiral", "Tel dikiş", "Amerikan cilt"],
    },
    {
      key: "adet_araligi",
      nameTr: "Baskı adedi",
      type: "SINGLE_SELECT",
      options: ["100'den az", "100 - 1.000", "1.000 - 10.000", "10.000 üzeri"],
    },
  ],

  // ── 56 · Mobilya ve Döşeme ──
  "56000000": [
    {
      key: "kullanim_alani",
      nameTr: "Kullanım alanı",
      type: "MULTI_SELECT",
      options: ["Ev", "Ofis", "Otel / kontrakt", "Eğitim", "Sağlık", "Dış mekân"],
      required: true,
    },
    {
      key: "malzeme",
      nameTr: "Malzeme",
      type: "MULTI_SELECT",
      options: ["Masif ahşap", "MDF / sunta", "Metal", "Cam", "Plastik", "Rattan", "Kumaş", "Deri"],
      required: true,
    },
    {
      key: "montaj",
      nameTr: "Teslim biçimi",
      type: "SINGLE_SELECT",
      options: ["Kurulu", "Demonte (flat-pack)", "Modüler"],
    },
    {
      key: "sertifika",
      nameTr: "Sertifika",
      type: "MULTI_SELECT",
      options: ["TSE", "FSC", "E1 (formaldehit)", "Yangına dayanım"],
    },
  ],

  // ── 57 · İnsani Yardım Malzemeleri ──
  "57000000": [
    {
      key: "kit_tipi",
      nameTr: "Kit tipi",
      type: "MULTI_SELECT",
      options: ["Gıda kolisi", "Hijyen kiti", "Barınma (çadır / battaniye)", "Su ve sanitasyon", "Sağlık kiti"],
      required: true,
    },
    {
      key: "saklama",
      nameTr: "Saklama koşulu",
      type: "SINGLE_SELECT",
      options: ["Oda sıcaklığı", "Kuru ve serin", "Soğuk zincir"],
    },
    {
      key: "standart",
      nameTr: "Standart",
      type: "MULTI_SELECT",
      options: ["Sphere standardı", "UN / UNHCR spesifikasyonu", "ISO 9001"],
    },
  ],

  // ── 60 · Eğitim Gereçleri, Müzik Aletleri ve Oyuncaklar ──
  "60000000": [
    {
      key: "urun_grubu",
      nameTr: "Ürün grubu",
      type: "MULTI_SELECT",
      options: ["Okul gereçleri", "Eğitim seti", "Müzik aleti", "Oyuncak", "Oyun alanı ekipmanı"],
      required: true,
    },
    {
      key: "yas_araligi",
      nameTr: "Yaş aralığı",
      type: "SINGLE_SELECT",
      options: ["0-3", "3-6", "6-12", "12+", "Yetişkin"],
    },
    {
      key: "sertifika",
      nameTr: "Sertifika",
      type: "MULTI_SELECT",
      options: ["CE", "EN 71 (oyuncak güvenliği)", "TSE"],
    },
    { key: "malzeme", nameTr: "Malzeme", type: "TEXT" },
  ],

  // ── 64 · Finansal Araçlar, Ürünler ve Sözleşmeler ──
  "64000000": [
    {
      key: "urun_tipi",
      nameTr: "Ürün tipi",
      type: "SINGLE_SELECT",
      options: ["Kredi / finansman", "Sigorta poliçesi", "Leasing", "Faktoring", "Teminat mektubu", "Yatırım ürünü"],
      required: true,
    },
    {
      key: "kurum_tipi",
      nameTr: "Kurum tipi",
      type: "SINGLE_SELECT",
      options: ["Banka", "Finansman şirketi", "Sigorta şirketi", "Aracı kurum"],
    },
    { key: "vade", nameTr: "Vade", type: "TEXT" },
  ],

  // ── 70 · Tarım ve Balıkçılık Hizmetleri ──
  "70000000": [
    {
      key: "hizmet_tipi",
      nameTr: "Hizmet tipi",
      type: "MULTI_SELECT",
      options: ["Toprak işleme", "Ekim - dikim", "İlaçlama", "Hasat", "Sulama sistemi kurulumu", "Hayvan bakımı", "Su ürünleri"],
      required: true,
    },
    SERVIS_MODELI,
    { key: "kapasite", nameTr: "Kapasite", type: "TEXT" },
    {
      key: "sertifika",
      nameTr: "Sertifika",
      type: "MULTI_SELECT",
      options: ["GlobalGAP", "Organik", "İyi Tarım Uygulamaları"],
    },
  ],

  // ── 71 · Maden, Petrol ve Doğal Gaz Hizmetleri ──
  "71000000": [
    {
      key: "hizmet_tipi",
      nameTr: "Hizmet tipi",
      type: "MULTI_SELECT",
      options: ["Sondaj", "Patlatma", "Jeolojik etüt", "Kuyu bakım", "Nakliye", "Cevher zenginleştirme"],
      required: true,
    },
    SERVIS_MODELI,
    {
      key: "calisma_alani",
      nameTr: "Çalışma alanı",
      type: "SINGLE_SELECT",
      options: ["Yer altı", "Açık ocak", "Karada (onshore)", "Denizde (offshore)"],
    },
    {
      key: "yetki_belgesi",
      nameTr: "Yetki belgesi",
      type: "MULTI_SELECT",
      options: ["Maden işletme ruhsatı", "EPDK lisansı", "Patlayıcı madde izni", "ISO 45001"],
    },
  ],

  // ── 76 · Endüstriyel Temizlik Hizmetleri ──
  "76000000": [
    {
      key: "hizmet_tipi",
      nameTr: "Hizmet tipi",
      type: "MULTI_SELECT",
      options: [
        "Fabrika temizliği",
        "Tank / silo temizliği",
        "Yüksek basınçlı yıkama",
        "Kanal ve atık hattı",
        "Cephe temizliği",
        "Dezenfeksiyon",
      ],
      required: true,
    },
    SERVIS_MODELI,
    { key: "ekip_buyuklugu", nameTr: "Ekip büyüklüğü", type: "NUMBER", unit: "kişi" },
    {
      key: "sertifika",
      nameTr: "Sertifika",
      type: "MULTI_SELECT",
      options: ["ISO 9001", "ISO 45001", "Biyosidal yetki belgesi"],
    },
  ],

  // ── 77 · Çevre Hizmetleri ──
  "77000000": [
    {
      key: "hizmet_tipi",
      nameTr: "Hizmet tipi",
      type: "MULTI_SELECT",
      options: [
        "Atık toplama / bertaraf",
        "Geri dönüşüm",
        "Arıtma tesisi",
        "Emisyon ölçümü",
        "Çevre danışmanlığı",
        "Zemin ıslahı",
      ],
      required: true,
    },
    {
      key: "yetki_belgesi",
      nameTr: "Yetki belgesi",
      type: "MULTI_SELECT",
      options: ["Çevre izni", "Lisanslı atık taşıma", "Yetkili laboratuvar", "ISO 14001"],
      required: true,
    },
    SERVIS_MODELI,
    { key: "atik_kodu", nameTr: "Atık kodu", type: "TEXT" },
  ],

  // ── 78 · Taşıma, Depolama ve Posta Hizmetleri ──
  "78000000": [
    {
      key: "tasima_modu",
      nameTr: "Taşıma modu",
      type: "MULTI_SELECT",
      options: ["Karayolu", "Denizyolu", "Havayolu", "Demiryolu", "Multimodal"],
      required: true,
    },
    {
      key: "hizmet_tipi",
      nameTr: "Hizmet tipi",
      type: "MULTI_SELECT",
      options: [
        "Komple (FTL)",
        "Parsiyel (LTL)",
        "Konteyner",
        "Soğuk zincir",
        "Proje / ağır nakliye",
        "Depolama",
        "Gümrükleme",
      ],
      required: true,
    },
    {
      key: "kapsam",
      nameTr: "Kapsam",
      type: "SINGLE_SELECT",
      options: ["Yurt içi", "İhracat", "İthalat", "Transit"],
    },
    {
      key: "yetki_belgesi",
      nameTr: "Yetki belgesi",
      type: "MULTI_SELECT",
      options: ["K1", "K2", "L2", "R1", "C2", "ADR", "Gümrük müşavirliği"],
    },
  ],

  // ── 80 · Profesyonel ve İdari Hizmetler ──
  "80000000": [
    {
      key: "hizmet_tipi",
      nameTr: "Hizmet tipi",
      type: "MULTI_SELECT",
      options: [
        "Yönetim danışmanlığı",
        "Muhasebe / mali müşavirlik",
        "Hukuk",
        "İnsan kaynakları",
        "Pazarlama",
        "İdari destek",
      ],
      required: true,
    },
    SERVIS_MODELI,
    CALISMA_BICIMI,
    { key: "sektor_uzmanligi", nameTr: "Sektör uzmanlığı", type: "TEXT" },
  ],

  // ── 81 · Teknoloji ve Mühendislik Hizmetleri ──
  "81000000": [
    {
      key: "hizmet_tipi",
      nameTr: "Hizmet tipi",
      type: "MULTI_SELECT",
      options: [
        "Yazılım geliştirme",
        "Sistem entegrasyonu",
        "Makine / proses mühendisliği",
        "İnşaat mühendisliği",
        "Test ve analiz",
        "Ar-Ge",
        "Otomasyon",
      ],
      required: true,
    },
    SERVIS_MODELI,
    CALISMA_BICIMI,
    {
      key: "yetki_belgesi",
      nameTr: "Belge",
      type: "MULTI_SELECT",
      options: ["ISO 9001", "ISO 27001", "Yetkili mühendislik bürosu", "Ar-Ge merkezi belgesi"],
    },
  ],

  // ── 82 · Kreatif Hizmetler ──
  "82000000": [
    {
      key: "hizmet_tipi",
      nameTr: "Hizmet tipi",
      type: "MULTI_SELECT",
      options: [
        "Grafik tasarım",
        "Marka / kurumsal kimlik",
        "Reklam ve kampanya",
        "Web / arayüz tasarımı",
        "Fotoğraf - video",
        "İçerik üretimi",
        "Matbaa öncesi hazırlık",
      ],
      required: true,
    },
    SERVIS_MODELI,
    CALISMA_BICIMI,
    { key: "teslim_formati", nameTr: "Teslim formatı", type: "TEXT" },
  ],

  // ── 83 · Kamu Sektörü Hizmetleri ──
  "83000000": [
    {
      key: "hizmet_tipi",
      nameTr: "Hizmet tipi",
      type: "MULTI_SELECT",
      options: ["Altyapı işletme", "Su ve kanalizasyon", "Enerji dağıtımı", "Belediye hizmetleri", "Telekom altyapısı"],
      required: true,
    },
    SERVIS_MODELI,
    {
      key: "yetki_belgesi",
      nameTr: "Yetki belgesi",
      type: "MULTI_SELECT",
      options: ["EPDK lisansı", "Belediye ruhsatı", "ISO 9001"],
    },
  ],

  // ── 84 · Finans ve Sigorta Hizmetleri ──
  "84000000": [
    {
      key: "hizmet_tipi",
      nameTr: "Hizmet tipi",
      type: "MULTI_SELECT",
      options: [
        "Muhasebe / denetim",
        "Sigorta aracılığı",
        "Kredi danışmanlığı",
        "Değerleme / ekspertiz",
        "Tahsilat",
        "Vergi danışmanlığı",
      ],
      required: true,
    },
    {
      key: "yetki_belgesi",
      nameTr: "Yetki belgesi",
      type: "MULTI_SELECT",
      options: ["SMMM / YMM ruhsatı", "SPK lisansı", "Sigorta acentelik belgesi", "BDDK izni"],
      required: true,
    },
    SERVIS_MODELI,
  ],

  // ── 85 · Sağlık Bakım Hizmetleri ──
  "85000000": [
    {
      key: "hizmet_tipi",
      nameTr: "Hizmet tipi",
      type: "MULTI_SELECT",
      options: ["Poliklinik / muayene", "Görüntüleme", "Laboratuvar", "Evde bakım", "İş yeri hekimliği", "Rehabilitasyon"],
      required: true,
    },
    {
      key: "yetki_belgesi",
      nameTr: "Ruhsat / belge",
      type: "MULTI_SELECT",
      options: ["Sağlık Bakanlığı ruhsatı", "ISO 15189", "JCI", "OSGB yetki belgesi"],
      required: true,
    },
    {
      key: "calisma_bicimi",
      nameTr: "Hizmet yeri",
      type: "SINGLE_SELECT",
      options: ["Kurumda", "Yerinde", "Uzaktan (teletıp)"],
    },
  ],

  // ── 86 · Eğitim ve Öğretim Hizmetleri ──
  "86000000": [
    {
      key: "egitim_tipi",
      nameTr: "Eğitim tipi",
      type: "MULTI_SELECT",
      options: [
        "Kurumsal eğitim",
        "Mesleki / teknik",
        "Yabancı dil",
        "Sertifika programı",
        "İş sağlığı ve güvenliği",
        "Yazılım / teknoloji",
      ],
      required: true,
    },
    {
      key: "format",
      nameTr: "Format",
      type: "SINGLE_SELECT",
      options: ["Yüz yüze", "Online (canlı)", "Online (kayıtlı)", "Karma"],
      required: true,
    },
    { key: "sure", nameTr: "Süre", type: "NUMBER", unit: "saat" },
    {
      key: "sertifika",
      nameTr: "Verilen belge",
      type: "MULTI_SELECT",
      options: ["MEB onaylı", "Üniversite onaylı", "Uluslararası sertifika", "Katılım belgesi"],
    },
  ],

  // ── 90 · Konaklama Hizmetleri ──
  "90000000": [
    {
      key: "hizmet_tipi",
      nameTr: "Hizmet tipi",
      type: "MULTI_SELECT",
      options: ["Otel / konaklama", "Toplu yemek (catering)", "Etkinlik ve organizasyon", "Seyahat acenteliği", "Transfer"],
      required: true,
    },
    { key: "kapasite", nameTr: "Kapasite", type: "NUMBER", unit: "kişi" },
    SERVIS_MODELI,
    {
      key: "sertifika",
      nameTr: "Belge",
      type: "MULTI_SELECT",
      options: ["Turizm işletme belgesi", "ISO 22000", "HACCP", "TÜRSAB üyeliği"],
    },
  ],

  // ── 91 · Kişisel ve Ev İçi Hizmetler ──
  "91000000": [
    {
      key: "hizmet_tipi",
      nameTr: "Hizmet tipi",
      type: "MULTI_SELECT",
      options: ["Temizlik", "Bakım - onarım", "Nakliyat", "Güzellik ve kişisel bakım", "Çocuk / yaşlı bakımı", "Bahçe"],
      required: true,
    },
    SERVIS_MODELI,
    {
      key: "calisma_bicimi",
      nameTr: "Hizmet yeri",
      type: "SINGLE_SELECT",
      options: ["Yerinde", "İş yerinde"],
    },
  ],

  // ── 92 · Kamu Düzeni, Güvenlik ve Emniyet Hizmetleri ──
  "92000000": [
    {
      key: "hizmet_tipi",
      nameTr: "Hizmet tipi",
      type: "MULTI_SELECT",
      options: ["Özel güvenlik", "Alarm izleme", "Kamera sistemi kurulumu", "Yangın güvenliği", "Risk danışmanlığı"],
      required: true,
    },
    {
      key: "yetki_belgesi",
      nameTr: "Yetki belgesi",
      type: "MULTI_SELECT",
      options: ["5188 özel güvenlik izni", "Alarm merkezi ruhsatı", "ISO 45001"],
      required: true,
    },
    SERVIS_MODELI,
  ],

  // ── 93 · Siyasi ve Yurttaşlık Hizmetleri ──
  "93000000": [
    {
      key: "hizmet_tipi",
      nameTr: "Hizmet tipi",
      type: "MULTI_SELECT",
      options: ["Kamu ilişkileri", "Sivil toplum projeleri", "Hibe / fon danışmanlığı", "Anket ve araştırma"],
      required: true,
    },
    SERVIS_MODELI,
  ],

  // ── 94 · Organizasyonlar ve Kulüpler ──
  "94000000": [
    {
      key: "kurulus_tipi",
      nameTr: "Kuruluş tipi",
      type: "SINGLE_SELECT",
      options: ["Dernek", "Vakıf", "Oda / birlik", "Kooperatif", "Kulüp", "Sendika"],
      required: true,
    },
    {
      key: "hizmet_tipi",
      nameTr: "Sunulan hizmet",
      type: "MULTI_SELECT",
      options: ["Üyelik", "Etkinlik", "Eğitim", "Belgelendirme", "Temsil ve savunuculuk"],
    },
  ],

  // ── 95 · Arazi, Binalar, Yapılar ve Ulaşım Altyapısı ──
  "95000000": [
    {
      key: "varlik_tipi",
      nameTr: "Varlık tipi",
      type: "SINGLE_SELECT",
      options: ["Arsa / arazi", "Fabrika / depo", "Ofis", "Ticari alan", "Konut", "Altyapı yapısı"],
      required: true,
    },
    {
      key: "islem",
      nameTr: "İşlem tipi",
      type: "SINGLE_SELECT",
      options: ["Satılık", "Kiralık", "Devren"],
      required: true,
    },
    { key: "alan", nameTr: "Alan", type: "NUMBER", unit: "m²" },
    {
      key: "imar_durumu",
      nameTr: "İmar durumu",
      type: "SINGLE_SELECT",
      options: ["Sanayi", "Ticari", "Konut", "Tarım", "Turizm", "İmarsız"],
    },
  ],
};
