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
 * ── KAPSAM BİLİNÇLİ OLARAK DAR ────────────────────────────────────────────
 * 58 segmentin 14'ü dolduruldu — Türkiye B2B'sinde en yoğun olanlar.
 * Doldurulmamış segmentte form nitelik SORMAZ ve yine çalışır: matris eksikken
 * ürün eklenemez hâle gelmemeli. Kalanlar talep geldikçe eklenir.
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
};
