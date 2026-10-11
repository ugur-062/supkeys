/**
 * STAGING DEMO HESAPLARI — VERİ (`seed-staging-demo.ts`in yazdığı üç firma:
 * Ücretsiz · Silver · Gold). Ayrı dosyaya 2026-10-09'da alındı: betik içe
 * aktarılınca ortam dosyasını okuyup veritabanına bağlanır; veri burada durunca
 * testler onu YAZMADAN okuyabiliyor (API `test/unit/seed-category-guard.spec.ts`).
 *
 * GİZLİ SEGMENT KURALI (2026-10-09, kullanıcı: "anasayfada olmayan kategori
 * talepte, üründe ya da başka yerde de gösterilmesin"): firma seçimleri
 * (`sellPicks` / `buyPicks`) ve ürün kategorileri yalnız GÖRÜNÜR segmentlerden
 * (`HIDDEN_SEGMENTS` dışı). Ücretsiz demo firma eskiden tümüyle gizli segment
 * 52'deydi (havlu, bornoz, nevresim); aynı hesaplarla pamuklu dokuma kumaş
 * üreticisine (11161700) taşındı. Gizli kod betiği ilk satırda durdurur
 * (`assertVisibleSeedCategories`).
 */
import type { CompanyActivity, CompanyRole, CompanyTier } from "@prisma/client";
import { seedPhotoCategoryRefs, type SeedCategoryRef } from "./seed-category-guard";

/** Ürün görseli ve firma kapağı: kategorinin segment fotoğrafı (repodaki CC0 havuzu). */
export const photo = (segment: string) => `/categories/${segment.slice(0, 2)}000000.webp`;

/* ───────────────────────── Tanımlar ───────────────────────── */

export type UserSpec = { slug: string; firstName: string; lastName: string; roles: CompanyRole[]; owner?: boolean; label: string };

export type ProductSpec = {
  name: string;
  /** L3 discovery kodu ya da segment + anahtar kelime ile çözülür. */
  cat: string;
  catKw?: string;
  desc: string;
  brand?: string;
  unit: string;
  kw: string[];
  price?: number;
  tiers?: { minQty: number; unitPrice: number }[];
  moq?: number;
};

export type CompanySpec = {
  key: string;
  name: string;
  legalName: string;
  tier: CompanyTier;
  verified: boolean;
  companyType: "JOINT_STOCK" | "LIMITED" | "SOLE_PROPRIETOR";
  taxNumber: string;
  city: string;
  district: string;
  industry: string;
  activities: CompanyActivity[];
  about: string;
  services: string[];
  certs: string[];
  founded: number;
  employees: string;
  /** Seçim (kullanıcının seçtiği derinlik) — ata zinciri betikte türetilir. */
  sellPicks: string[];
  buyPicks: string[];
  users: UserSpec[];
  products: ProductSpec[];
};

export const COMPANIES: CompanySpec[] = [
  {
    key: "gold",
    name: "Demo Gold Makina",
    legalName: "Demo Gold Makina Sanayi ve Ticaret A.Ş.",
    tier: "GOLD",
    verified: true,
    companyType: "JOINT_STOCK",
    taxNumber: "9200000011",
    city: "İstanbul",
    district: "Tuzla",
    industry: "Makine ve proses ekipmanı",
    activities: ["MANUFACTURER", "IMPORTER_EXPORTER"],
    founded: 2004,
    employees: "51-250",
    about:
      "Tuzla'daki 9 bin metrekarelik tesisimizde gıda ve kimya sanayi için paslanmaz proses ekipmanı, konveyör ve basınçlı hava sistemleri üretiyoruz. Tasarımdan devreye almaya kadar anahtar teslim çalışıyor, 22 ülkeye ihracat yapıyoruz.",
    services: ["Proje mühendisliği", "Montaj ve devreye alma", "Yedek parça ve bakım"],
    certs: ["ISO 9001", "CE", "ISO 14001"],
    sellPicks: ["24101500", "40151600"],
    buyPicks: ["31000000", "39000000"],
    users: [
      { slug: "gold-kurucu", label: "Kurucu", firstName: "Deniz", lastName: "Kurucu", roles: ["SAHIP", "SATIN_ALMACI", "SATISCI"], owner: true },
      { slug: "gold-yonetici", label: "Yönetici", firstName: "Ece", lastName: "Yönetici", roles: ["YONETICI"] },
      { slug: "gold-satinalmaci", label: "Satınalmacı", firstName: "Mert", lastName: "Satınalma", roles: ["SATIN_ALMACI"] },
      { slug: "gold-satisci", label: "Satışçı", firstName: "Selin", lastName: "Satış", roles: ["SATISCI"] },
      { slug: "gold-onaylayici", label: "Onaylayıcı", firstName: "Onur", lastName: "Onay", roles: ["ONAYLAYICI"] },
    ],
    products: [
      { name: "Modüler Bant Konveyör 600 mm", cat: "24101500", catKw: "konveyör", unit: "m", brand: "Demo Gold", kw: ["konveyör", "bant konveyör", "gıda hattı"], price: 36500, moq: 3,
        desc: "Paslanmaz çelik gövdeli, modüler plastik bantlı konveyör. 600 mm bant genişliği, frekans kontrollü tahrik ve yıkanabilir tasarım; gıda ve ambalaj hatları için metre bazında üretilir." },
      { name: "Vidalı Hava Kompresörü 22 kW 8 bar", cat: "40151600", catKw: "kompresör", unit: "adet", brand: "Demo Gold", kw: ["kompresör", "vidalı kompresör", "basınçlı hava"], price: 318000, moq: 1,
        desc: "22 kW gücünde, 8 bar çalışma basıncında, dakikada 3,6 m³ hava üreten invertörlü vidalı kompresör. Entegre kurutucu seçeneği, kurulum ve iki yıl garanti dahildir." },
      { name: "Paslanmaz Karıştırıcılı Tank 2000 L", cat: "23000000", catKw: "tank", unit: "adet", brand: "Demo Gold", kw: ["karıştırıcı tank", "paslanmaz tank", "proses"],
        desc: "AISI 316L paslanmaz çelikten 2000 litrelik ceketli karıştırıcılı tank. Isıtma ve soğutma ceketi, CIP temizleme başlığı ve seviye sensörüyle gıda ve kozmetik üretimine uygundur." },
      { name: "Endüstriyel Dişli Motor Redüktör", cat: "26000000", catKw: "redüktör", unit: "adet", brand: "Demo Gold", kw: ["redüktör", "dişli motor", "tahrik"],
        tiers: [{ minQty: 1, unitPrice: 14200 }, { minQty: 10, unitPrice: 12900 }, { minQty: 50, unitPrice: 11800 }],
        desc: "Helisel dişli, 0,75–7,5 kW aralığında motorlu redüktör. Konveyör, karıştırıcı ve vinç tahriklerinde kullanılır; yüksek verimli dişli seti ve IP55 motor koruma sınıfıyla sunulur." },
      { name: "Pnömatik Silindir Seti (ISO 15552)", cat: "40000000", catKw: "silindir", unit: "set", brand: "Demo Gold", kw: ["pnömatik silindir", "ISO 15552", "otomasyon"], price: 2450, moq: 10,
        desc: "ISO 15552 standardında çift etkili pnömatik silindir seti. 32–100 mm piston çapı, manyetik piston ve ayarlı yastıklama; otomasyon hatları için bağlantı elemanlarıyla birlikte gönderilir." },
    ],
  },
  {
    key: "silver",
    name: "Demo Silver Elektrik",
    legalName: "Demo Silver Elektrik Malzemeleri Ltd. Şti.",
    tier: "SILVER",
    verified: true,
    companyType: "LIMITED",
    taxNumber: "9200000022",
    city: "Bursa",
    district: "Nilüfer",
    industry: "Elektrik malzemeleri",
    activities: ["DISTRIBUTOR"],
    founded: 2011,
    employees: "11-50",
    about:
      "Bursa merkezli elektrik malzemeleri toptancısıyız. Kablo, pano, şalt malzemesi ve LED aydınlatmada 12 markanın yetkili bayisiyiz; projeye özel fiyat veriyor, Marmara bölgesindeki şantiyelere ertesi gün teslim ediyoruz.",
    services: ["Proje tedariki", "Şantiye teslimi", "Teknik ürün desteği"],
    certs: ["ISO 9001"],
    sellPicks: ["39121600", "26121600"],
    buyPicks: [],
    users: [
      { slug: "silver-kurucu", label: "Kurucu", firstName: "Can", lastName: "Kurucu", roles: ["SAHIP", "SATISCI"], owner: true },
      { slug: "silver-satisci", label: "Satışçı", firstName: "Buse", lastName: "Satış", roles: ["SATISCI"] },
      { slug: "silver-onaylayici", label: "Onaylayıcı", firstName: "Okan", lastName: "Onay", roles: ["ONAYLAYICI"] },
    ],
    products: [
      { name: "NYY Enerji Kablosu 3x2,5 mm²", cat: "26121600", catKw: "kablo", unit: "m", brand: "Demo Silver", kw: ["NYY kablo", "enerji kablosu", "yeraltı kablosu"],
        tiers: [{ minQty: 100, unitPrice: 48 }, { minQty: 1000, unitPrice: 43 }],
        desc: "PVC izoleli, bakır iletkenli 0,6/1 kV NYY enerji kablosu. Toprak altı, kablo kanalı ve dış ortam tesisatlarına uygundur; 100 ve 500 metrelik makaralarda stoktan sevk edilir." },
      { name: "Sıva Üstü Dağıtım Panosu 24 Modül", cat: "39121600", catKw: "pano", unit: "adet", brand: "Demo Silver", kw: ["dağıtım panosu", "sigorta kutusu", "pano"], price: 1650, moq: 5,
        desc: "IP65 koruma sınıfında, 24 modüllü sıva üstü dağıtım panosu. Şeffaf kapak, N ve PE baraları dahil; konut, dükkân ve şantiye elektrik tesisatları için hazır montaj kitiyle gelir." },
      { name: "Kaçak Akım Rölesi 4P 40A 30mA", cat: "39121600", catKw: "röle", unit: "adet", brand: "Demo Silver", kw: ["kaçak akım rölesi", "RCD", "şalt"], price: 890, moq: 10,
        desc: "Dört kutuplu, 40 amper, 30 mA hassasiyetli kaçak akım koruma rölesi. EN 61008 standardına uygun, raya montajlı; insan hayatını ve tesisatı toprak kaçaklarına karşı korur." },
      { name: "LED Endüstriyel Yüksek Tavan Armatürü 150W", cat: "39000000", catKw: "aydınlatma", unit: "adet", brand: "Demo Silver", kw: ["LED armatür", "high bay", "fabrika aydınlatma"],
        desc: "150 watt, 21.000 lümen LED yüksek tavan armatürü. Alüminyum soğutucu gövde, IP65 koruma ve beş yıl garanti; depo, fabrika ve spor salonu aydınlatmasında enerji tasarrufu sağlar." },
    ],
  },
  {
    key: "ucretsiz",
    name: "Demo Ücretsiz Tekstil",
    legalName: "Demo Ücretsiz Tekstil Ltd. Şti.",
    tier: "STANDART",
    verified: false,
    companyType: "LIMITED",
    taxNumber: "9200000033",
    city: "Denizli",
    district: "Merkezefendi",
    industry: "Dokuma kumaş",
    activities: ["MANUFACTURER"],
    founded: 2016,
    employees: "11-50",
    about:
      "Denizli'de pamuklu havlu kumaşı, waffle ve ranforce dokuma kumaş üretiyoruz. Kendi dokuma ve boyahanemizde otel tekstili ve ev tekstili üreticileri için özel en, gramaj ve renkte kumaş hazırlıyor, küçük partilere de üretim yapıyoruz.",
    services: ["Özel en ve gramaj dokuma", "Fason boyama", "Numune üretimi"],
    certs: ["OEKO-TEX Standard 100"],
    sellPicks: ["11161700"],
    buyPicks: ["11000000"],
    users: [
      { slug: "ucretsiz-kurucu", label: "Kurucu", firstName: "Aylin", lastName: "Kurucu", roles: ["SAHIP", "SATISCI"], owner: true },
      { slug: "ucretsiz-satisci", label: "Satışçı", firstName: "Emre", lastName: "Satış", roles: ["SATISCI"] },
    ],
    products: [
      { name: "Pamuklu Havlu Kumaşı 500 g/m² (150 cm En)", cat: "11161700", catKw: "pamuklu", unit: "m", brand: "Demo Tekstil", kw: ["havlu kumaşı", "pamuklu kumaş", "havlu dokuma"],
        tiers: [{ minQty: 50, unitPrice: 165 }, { minQty: 500, unitPrice: 139 }],
        desc: "Yüzde yüz pamuk, 500 g/m² ağırlığında beyaz havlu (terry) kumaşı; 150 cm en, top hâlinde. Endüstriyel yıkamaya dayanıklı çift bükümlü hav ipliğiyle dokunur; havlu ve bornoz üreticilerine metre bazında satılır." },
      { name: "Waffle Dokuma Pamuklu Kumaş 240 g/m²", cat: "11161700", catKw: "pamuklu", unit: "m", brand: "Demo Tekstil", kw: ["waffle kumaş", "petek dokuma", "bornozluk kumaş"], price: 185, moq: 100,
        desc: "Hafif waffle (petek) dokuma pamuklu kumaş, 240 g/m², 160 cm en. Yıkama sonrası çekmezlik apreli; bornoz, peştamal ve spa tekstili üreticileri için özel renk seçeneği ve top bazında sevkiyatla hazırlanır." },
      { name: "Ranforce Pamuklu Kumaş 240 cm En", cat: "11161700", catKw: "pamuklu", unit: "m", brand: "Demo Tekstil", kw: ["ranforce kumaş", "nevresimlik kumaş", "pamuklu dokuma"],
        desc: "Yüzde yüz pamuk ranforce kumaş, 240 cm en, 125 g/m²; nevresimlik ve çarşaflık. Renk haslığı yüksek reaktif boya ve sanfor apresiyle uzun ömürlü kullanım sunar; düz renk ve baskıya hazır beyaz seçenekleri vardır." },
    ],
  },
];

/** Betiğin yazacağı BÜTÜN kategori kodları — gizli segment kapısına verilir. */
export function stagingDemoCategoryRefs(): SeedCategoryRef[] {
  return COMPANIES.flatMap((c) => [
    ...c.sellPicks.map((code) => ({ source: `company ${c.key} sellPicks`, code })),
    ...c.buyPicks.map((code) => ({ source: `company ${c.key} buyPicks`, code })),
    ...c.products.map((p) => ({ source: `product "${p.name}" (${c.key})`, code: p.cat })),
  ]);
}

/** Betiğin kullandığı bütün görsel yolları (ürün + firma kapağı). */
export function stagingDemoPhotos(): string[] {
  return [
    ...new Set(COMPANIES.flatMap((c) => [photo(c.sellPicks[0] ?? "81000000"), ...c.products.map((p) => photo(p.cat))])),
  ];
}

/**
 * Aynı görseller, gizli segment kapısının başvurusu olarak. Görsel burada
 * kategori kodundan türer (`photo`), yani kod görünürse fotoğraf da görünür;
 * kapıya yine verilir — görsel bir gün elle yazılırsa aynı çağrı yakalar.
 */
export function stagingDemoPhotoRefs(): SeedCategoryRef[] {
  return seedPhotoCategoryRefs(
    COMPANIES.flatMap((c) => [
      { source: `company ${c.key} cover`, src: photo(c.sellPicks[0] ?? "81000000") },
      ...c.products.map((p) => ({ source: `product "${p.name}" (${c.key})`, src: photo(p.cat) })),
    ]),
  );
}
