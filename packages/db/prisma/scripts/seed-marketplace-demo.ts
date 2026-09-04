/**
 * PAZAR YERİ DEMO DOLULUĞU (2026-09-04) — herkese açık vitrin "dolu" görünsün:
 * 20 firma (paketli, doğrulanmış, herkese açık profil, kapak görselli, kategori
 * ve faaliyet beyanlı), ~56 yayında ürün (görselli, fiyatlı/kademeli/teklifle),
 * 16 herkese açık ALIM talebi (kalemli, 5–25 gün açık), 8 SATIŞ ilanı,
 * bağlantılar ve birkaç teklif.
 *
 * `seed-demo-fill.ts`in yerine geçer (aynı `@demofill.local` işareti): her
 * koşuda önce o işaretli firmalar silinir (cascade) → idempotent, geri alınabilir.
 * Kaldırmak için: `npx tsx prisma/scripts/cleanup-marketplace-demo.ts`.
 *
 * ⚠ dev ve prod AYNI Supabase DB — bu veri canlıda da görünür (kullanıcı
 * kararı, 2026-09-04). Görseller loremflickr.com (CC, anahtar kelimeli, `lock`
 * ile sabit); logo yok (baş harf yedeği).
 *
 * Çalıştır:  cd packages/db && npx tsx prisma/scripts/seed-marketplace-demo.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

for (const line of readFileSync(resolve(__dirname, "../../.env"), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.trimStart().startsWith("#")) {
    const k = line.slice(0, i).trim();
    if (!process.env[k]) process.env[k] = line.slice(i + 1).trim().replace(/^"|"$/g, "");
  }
}

import { PrismaClient, type CompanyActivity, type CompanyTier, type Prisma } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { foldSearchText, generateSlug, productCompletion } from "@rothern/shared";

const prisma = new PrismaClient();
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PASSWORD = "Demo1234!";
const DOMAIN = "@demofill.local";
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const genCode = () => {
  const p = () => Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join("");
  return `${p()}-${p()}`;
};
const days = (n: number) => new Date(Date.now() + n * 86400_000);
const img = (kw: string, lock: number, w = 800, h = 600) => `https://loremflickr.com/${w}/${h}/${kw}/all?lock=${lock}`;

async function findAuthUser(email: string): Promise<string | null> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data.users.length) return null;
    const u = data.users.find((x) => x.email?.toLowerCase() === email.toLowerCase());
    if (u) return u.id;
    if (data.users.length < 200) return null;
  }
  return null;
}
async function ensureAuthUser(email: string): Promise<string> {
  const existing = await findAuthUser(email);
  if (existing) {
    await supabase.auth.admin.updateUserById(existing, { password: PASSWORD });
    return existing;
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true, user_metadata: { role: "company_user" },
  });
  if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message}`);
  return data.user.id;
}

/* ───────────────────────── Firmalar ───────────────────────── */
type Co = {
  key: string; name: string; tier: CompanyTier; city: string; industry: string;
  activities: CompanyActivity[]; about: string; services: string[]; certs: string[];
  founded: number; employees: string; cover: string; sell: string[]; buy: string[];
  verified?: boolean; publicProfile?: boolean;
};
const COMPANIES: Co[] = [
  { key: "anadolu", name: "Anadolu İnşaat A.Ş.", tier: "GOLD", city: "Ankara", industry: "İnşaat ve altyapı", activities: ["SERVICE_PROVIDER"], founded: 1994, employees: "250-500", cover: "construction,site", sell: ["72000000"], buy: ["30000000", "22000000"],
    about: "1994'ten bu yana kamu ve özel sektör için konut, ticari yapı ve altyapı projeleri yürütüyoruz. Ankara merkezli ekibimiz, Türkiye genelinde 40'tan fazla şantiyede anahtar teslim uygulama yapmıştır.", services: ["Anahtar teslim yapı", "Altyapı", "Restorasyon"], certs: ["ISO 9001", "ISO 45001"] },
  { key: "ege", name: "Ege Tekstil San. Tic. A.Ş.", tier: "GOLD", city: "İzmir", industry: "Tekstil ve konfeksiyon", activities: ["MANUFACTURER", "IMPORTER_EXPORTER"], founded: 1987, employees: "500-1000", cover: "textile,factory", sell: ["11000000", "53000000"], buy: ["12000000"],
    about: "Örme ve dokuma kumaş üretiminde 35 yılı aşkın deneyim. Kendi boyahanemiz ve iplik tesisimizle Avrupa'daki hazır giyim markalarına OEKO-TEX sertifikalı kumaş tedarik ediyoruz.", services: ["Fason boyama", "Numune geliştirme"], certs: ["OEKO-TEX Standard 100", "ISO 9001", "GOTS"] },
  { key: "marmara", name: "Marmara Gıda Ltd. Şti.", tier: "GOLD", city: "Bursa", industry: "Gıda üretimi", activities: ["MANUFACTURER"], founded: 2003, employees: "100-250", cover: "food,factory", sell: ["50000000"], buy: ["24000000", "14000000"],
    about: "Bursa'daki tesisimizde konserve sebze, meyve ve salça üretiyoruz. Yılda 12 bin ton işleme kapasitesi, BRC sertifikalı üretim hattı ve 14 ülkeye ihracat.", services: ["Özel markalı üretim", "İhracat lojistiği"], certs: ["BRC", "ISO 22000", "Helal"] },
  { key: "toros", name: "Toros Kimya A.Ş.", tier: "GOLD", city: "Adana", industry: "Endüstriyel kimya", activities: ["MANUFACTURER", "DISTRIBUTOR"], founded: 1999, employees: "100-250", cover: "chemical,plant", sell: ["12000000"], buy: ["24000000"],
    about: "Endüstriyel temizlik kimyasalları, su arıtma ve tekstil yardımcı kimyasalları üretiyoruz. Adana OSB'deki tesisimiz REACH uyumlu; teknik ekibimiz saha uygulama desteği verir.", services: ["Teknik danışmanlık", "Dökme teslimat"], certs: ["ISO 9001", "ISO 14001"] },
  { key: "karadeniz", name: "Karadeniz Enerji A.Ş.", tier: "GOLD", city: "Samsun", industry: "Enerji ve elektrik", activities: ["SERVICE_PROVIDER", "DISTRIBUTOR"], founded: 2008, employees: "50-100", cover: "power,electric", sell: ["26000000", "39000000"], buy: ["26000000", "39000000"],
    about: "Orta gerilim şebeke tesisi, trafo merkezi kurulumu ve güneş enerjisi santrali EPC işleri yapıyoruz. Karadeniz bölgesinde 120 MW kurulu güçte proje teslim ettik.", services: ["GES EPC", "OG/AG tesisat", "Bakım"], certs: ["ISO 9001", "ISO 45001"] },
  { key: "baskent", name: "Başkent Medikal Ltd. Şti.", tier: "GOLD", city: "Ankara", industry: "Medikal ve sağlık", activities: ["DISTRIBUTOR", "IMPORTER_EXPORTER"], founded: 2005, employees: "50-100", cover: "medical,supplies", sell: ["42000000"], buy: ["42000000", "41000000"],
    about: "Hastane ve kliniklere tıbbi sarf malzeme, cerrahi el aleti ve laboratuvar tüketim malzemesi tedarik ediyoruz. CE belgeli 2.400 kalem ürün, 48 saat içinde teslimat.", services: ["Hastane sarf tedariki", "Cihaz bakım"], certs: ["ISO 13485", "CE"] },
  { key: "akdeniz", name: "Akdeniz Lojistik A.Ş.", tier: "SILVER", city: "Mersin", industry: "Lojistik ve depolama", activities: ["SERVICE_PROVIDER"], founded: 2001, employees: "250-500", cover: "logistics,warehouse", sell: ["78000000"], buy: ["24000000", "25000000"],
    about: "Mersin Limanı'na 3 km mesafede 40 bin m² kapalı depo, soğuk zincir ve konteyner nakliyesi. Türkiye genelinde 180 araçlık filo ile parsiyel ve komple taşıma.", services: ["Depolama", "Soğuk zincir", "Gümrükleme"], certs: ["ISO 9001", "ISO 28000"] },
  { key: "metal", name: "İç Anadolu Metal San. A.Ş.", tier: "GOLD", city: "Konya", industry: "Metal işleme", activities: ["MANUFACTURER", "CONTRACT_MANUFACTURER"], founded: 1991, employees: "100-250", cover: "steel,factory", sell: ["31000000", "30000000"], buy: ["11000000", "23000000"],
    about: "Lazer kesim, abkant büküm ve CNC talaşlı imalatta 30 yıllık tecrübe. Konya OSB'de 12 bin m² kapalı alanda otomotiv ve beyaz eşya yan sanayine fason üretim yapıyoruz.", services: ["Lazer kesim", "CNC işleme", "Toz boya"], certs: ["ISO 9001", "IATF 16949"] },
  { key: "yildiz", name: "Yıldız Ofis Malzemeleri", tier: "BRONZ", city: "İstanbul", industry: "Ofis ve kırtasiye", activities: ["DISTRIBUTOR"], founded: 2012, employees: "10-50", cover: "office,supplies", sell: ["44000000", "56000000"], buy: ["44000000"],
    about: "Kurumsal ofislere kırtasiye, kağıt ürünleri ve ofis mobilyası tedarik ediyoruz. İstanbul içi ertesi gün teslimat, tek fatura, aylık mutabakat.", services: ["Kurumsal tedarik", "Ofis kurulumu"], certs: ["ISO 9001"] },
  { key: "demir", name: "Demir Hırdavat Ltd.", tier: "BRONZ", city: "Gaziantep", industry: "Hırdavat ve el aletleri", activities: ["DISTRIBUTOR", "IMPORTER_EXPORTER"], founded: 1998, employees: "10-50", cover: "hardware,tools", sell: ["27000000", "31000000"], buy: ["27000000"],
    about: "Bağlantı elemanları, el aletleri ve endüstriyel sarf malzemede toptan tedarikçi. 8.000 kalem stok, Gaziantep ve Güneydoğu'da aynı gün sevkiyat.", services: ["Toptan satış", "Bayilik"], certs: [] },
  { key: "gunes", name: "Güneş Temizlik Hizmetleri", tier: "BRONZ", city: "İstanbul", industry: "Tesis hizmetleri", activities: ["SERVICE_PROVIDER"], founded: 2010, employees: "250-500", cover: "cleaning,service", sell: ["76000000"], buy: ["47000000"],
    about: "Fabrika, AVM ve ofis binalarında profesyonel temizlik, dış cephe ve endüstriyel temizlik hizmeti veriyoruz. 600 personel, 7/24 operasyon.", services: ["Endüstriyel temizlik", "Dış cephe", "Peyzaj"], certs: ["ISO 9001", "ISO 14001"] },
  { key: "mavi", name: "Mavi Bilişim Çözümleri", tier: "SILVER", city: "İstanbul", industry: "Yazılım ve BT", activities: ["SERVICE_PROVIDER"], founded: 2015, employees: "50-100", cover: "software,office", sell: ["81000000", "43000000"], buy: ["43000000"],
    about: "Üretim ve lojistik firmaları için ERP entegrasyonu, depo yönetim yazılımı ve saha mobil uygulamaları geliştiriyoruz. 70 kurumsal müşteri, SaaS ve yerinde kurulum.", services: ["ERP entegrasyonu", "WMS", "Mobil uygulama"], certs: ["ISO 27001"] },
  { key: "bursa-oto", name: "Bursa Otomotiv Parça San. A.Ş.", tier: "GOLD", city: "Bursa", industry: "Otomotiv yan sanayi", activities: ["MANUFACTURER", "CONTRACT_MANUFACTURER"], founded: 1996, employees: "500-1000", cover: "automotive,parts", sell: ["25000000", "31000000"], buy: ["11000000", "31000000"],
    about: "Ana sanayiye şasi ve süspansiyon parçaları üretiyoruz. Robotik kaynak hatları, 3 vardiya, IATF 16949 belgeli kalite sistemi ve Avrupa'ya doğrudan sevkiyat.", services: ["Fason kaynak", "Pres"], certs: ["IATF 16949", "ISO 14001"] },
  { key: "kocaeli-plastik", name: "Kocaeli Plastik Ambalaj Ltd.", tier: "SILVER", city: "Kocaeli", industry: "Plastik ve ambalaj", activities: ["MANUFACTURER"], founded: 2009, employees: "50-100", cover: "plastic,packaging", sell: ["24000000", "30000000"], buy: ["13000000"],
    about: "Gıda ve kimya sektörü için PET, HDPE şişe ve endüstriyel ambalaj üretiyoruz. Kendi kalıphanemizle özel tasarım, 20 enjeksiyon ve şişirme hattı.", services: ["Özel kalıp", "Baskılı ambalaj"], certs: ["BRC Packaging", "ISO 9001"] },
  { key: "izmir-makina", name: "İzmir Makina Endüstri A.Ş.", tier: "GOLD", city: "İzmir", industry: "Makine imalatı", activities: ["MANUFACTURER", "IMPORTER_EXPORTER"], founded: 1985, employees: "100-250", cover: "industrial,machine", sell: ["23000000", "40000000"], buy: ["31000000", "26000000"],
    about: "Gıda ve kimya sanayi için paslanmaz proses ekipmanı, karıştırıcı, tank ve konveyör sistemleri üretiyoruz. 38 ülkeye ihracat, 1985'ten beri aynı tesiste.", services: ["Proje mühendisliği", "Montaj ve devreye alma"], certs: ["ISO 9001", "CE", "PED"] },
  { key: "antalya-tarim", name: "Antalya Tarım Ürünleri Koop.", tier: "SILVER", city: "Antalya", industry: "Tarım ve seracılık", activities: ["MANUFACTURER", "IMPORTER_EXPORTER"], founded: 2004, employees: "100-250", cover: "greenhouse,tomato", sell: ["10000000", "50000000"], buy: ["21000000", "10000000"],
    about: "Sera üreticisi 240 ortağımızın domates, biber ve salatalık üretimini paketleyip ihraç ediyoruz. GlobalGAP sertifikalı 1.200 dönüm sera, günlük 90 ton sevkiyat.", services: ["İhracat paketleme", "Soğuk depo"], certs: ["GlobalGAP", "ISO 22000"] },
  { key: "trakya-elektrik", name: "Trakya Elektrik Malzemeleri", tier: "BRONZ", city: "Tekirdağ", industry: "Elektrik malzemeleri", activities: ["DISTRIBUTOR"], founded: 2011, employees: "10-50", cover: "electrical,cable", sell: ["39000000", "26000000"], buy: ["39000000"],
    about: "Kablo, pano, şalt malzemesi ve aydınlatmada Çerkezköy merkezli toptan tedarikçi. 14 markanın yetkili bayisi, projeye özel fiyatlandırma ve şantiye teslimi.", services: ["Proje tedariki", "Şantiye teslimi"], certs: ["ISO 9001"] },
  { key: "kayseri-mobilya", name: "Kayseri Mobilya San. Ltd.", tier: "SILVER", city: "Kayseri", industry: "Mobilya", activities: ["MANUFACTURER"], founded: 2000, employees: "100-250", cover: "furniture,factory", sell: ["56000000"], buy: ["11000000", "30000000"],
    about: "Ofis ve otel mobilyası üretiyoruz; proje bazlı özel tasarım, 15 bin m² üretim alanı. Türkiye'de 300'den fazla otel ve plaza projesi tamamladık.", services: ["Proje mobilyası", "Montaj"], certs: ["ISO 9001", "FSC"] },
  { key: "samsun-ambalaj", name: "Samsun Oluklu Mukavva A.Ş.", tier: "BRONZ", city: "Samsun", industry: "Kağıt ve ambalaj", activities: ["MANUFACTURER"], founded: 2007, employees: "50-100", cover: "cardboard,boxes", sell: ["14000000", "24000000"], buy: ["14000000"],
    about: "Oluklu mukavva koli, tepsi ve baskılı ambalaj üretiyoruz. Gıda ve fındık ihracatçılarına özel ölçü, 3 ve 5 katlı seçenekler, haftalık 400 ton kapasite.", services: ["Özel ölçü koli", "Flekso baskı"], certs: ["FSC", "ISO 9001"] },
  { key: "denizli-havlu", name: "Denizli Havlu ve Ev Tekstili", tier: "STANDART", city: "Denizli", industry: "Ev tekstili", activities: ["MANUFACTURER"], founded: 2013, employees: "50-100", cover: "towel,cotton", sell: ["52000000", "11000000"], buy: ["11000000"], publicProfile: false, verified: false,
    about: "Otel ve spa için havlu, bornoz ve nevresim üretiyoruz. Paketsiz üye örneği: profil herkese açık değil.", services: ["Otel tekstili"], certs: [] },
];

const CONNECTIONS: [string, string][] = [
  ["yildiz", "anadolu"], ["demir", "metal"], ["mavi", "baskent"], ["gunes", "akdeniz"], ["ege", "marmara"],
  ["toros", "karadeniz"], ["yildiz", "ege"], ["demir", "toros"], ["bursa-oto", "metal"], ["kocaeli-plastik", "marmara"],
  ["izmir-makina", "toros"], ["antalya-tarim", "akdeniz"], ["trakya-elektrik", "karadeniz"], ["samsun-ambalaj", "antalya-tarim"],
  ["kayseri-mobilya", "yildiz"], ["denizli-havlu", "ege"],
];

/* ───────────────────────── Ürünler ───────────────────────── */
type Pr = {
  owner: string; name: string; cat: string; catKw?: string; desc: string; spec?: string; brand?: string; mpn?: string;
  unit: string; kw: string[]; img: string; price?: number; tiers?: { minQty: number; unitPrice: number }[]; moq?: number; cur?: "TRY" | "USD" | "EUR";
};
const PRODUCTS: Pr[] = [
  // ege
  { owner: "ege", name: "%100 Pamuk Penye Kumaş 180 g/m²", cat: "11162100", catKw: "kumaş", desc: "Ne 30/1 penye iplikten örülmüş, 180 g/m² gramajlı süprem kumaş. Tişört ve iç giyim için; OEKO-TEX sertifikalı, reaktif boyalı, 60 renk seçeneği. Top ağırlığı 25–30 kg.", spec: "En: 180 cm (açık)\nGramaj: 180 g/m² ±5\nÇekme: max %5 (60°C)", brand: "Ege Tekstil", unit: "kg", kw: ["penye", "süprem", "pamuk kumaş", "tişört kumaşı"], img: "cotton,fabric", tiers: [{ minQty: 100, unitPrice: 245 }, { minQty: 500, unitPrice: 228 }, { minQty: 2000, unitPrice: 212 }], moq: 100 },
  { owner: "ege", name: "Polyester Astar Kumaş 60 g/m²", cat: "11162100", catKw: "kumaş", desc: "Ceket ve mont astarı için 60 g/m² polyester taft astar. 150 cm en, antistatik apre, 40 stok renk. Konfeksiyon fasonculara top bazında sevkiyat.", brand: "Ege Tekstil", unit: "m", kw: ["astar", "polyester", "taft"], img: "fabric,roll", price: 38, moq: 500 },
  { owner: "ege", name: "Organik Pamuk İplik Ne 20/1 (GOTS)", cat: "11151600", desc: "GOTS sertifikalı organik pamuktan ring iplik, Ne 20/1, örme ve dokuma için. 1,8 kg bobin, palet bazında teslim. Test raporu her partide.", brand: "Ege Tekstil", mpn: "EGE-OC-20", unit: "kg", kw: ["organik pamuk", "iplik", "GOTS", "ring iplik"], img: "yarn,cotton", price: 168, moq: 500 },
  // marmara
  { owner: "marmara", name: "Domates Salçası 5 kg Teneke (28-30 Brix)", cat: "50192400", catKw: "salça", desc: "Çift konsantre domates salçası, 28–30 Brix, katkısız. 5 kg teneke, kolide 4 adet. Horeca ve toptan gıda için; raf ömrü 24 ay.", brand: "Marmara", unit: "adet", kw: ["salça", "domates", "horeca", "toptan gıda"], img: "tomato,paste", tiers: [{ minQty: 48, unitPrice: 295 }, { minQty: 480, unitPrice: 268 }], moq: 48 },
  { owner: "marmara", name: "Konserve Bezelye 400 g", cat: "50192400", catKw: "konserve", desc: "Taze hasat bezelye, 400 g teneke, kolide 24 adet. Özel markalı üretim yapılır; minimum sipariş bir palet (2.400 adet).", brand: "Marmara", unit: "adet", kw: ["konserve", "bezelye", "private label"], img: "canned,food", price: 24.5, moq: 2400 },
  { owner: "marmara", name: "Kornişon Turşu 720 ml Cam Kavanoz", cat: "50192400", catKw: "turşu", desc: "3–6 cm boy kornişon, 720 ml cam kavanoz, kolide 12. İhracat kalitesi, BRC sertifikalı tesis. Etiket ve kapak rengi özelleştirilebilir.", brand: "Marmara", unit: "adet", kw: ["turşu", "kornişon", "ihracat"], img: "pickles,jar", price: 41, moq: 1200 },
  // toros
  { owner: "toros", name: "Kostik Soda %99 (Sodyum Hidroksit) 25 kg", cat: "12352300", catKw: "hidroksit", desc: "%99 saflıkta pul kostik soda, 25 kg PE torba, paletli. Tekstil, sabun ve su arıtma sektörü için; analiz sertifikası her partide.", brand: "Toros Kimya", unit: "kg", kw: ["kostik", "sodyum hidroksit", "NaOH"], img: "chemical,industrial", tiers: [{ minQty: 1000, unitPrice: 24 }, { minQty: 10000, unitPrice: 21.5 }], moq: 1000 },
  { owner: "toros", name: "Endüstriyel Yağ Sökücü Konsantre 20 L", cat: "47131800", catKw: "temizleyici", desc: "Makine ve zemin yağlarını çözen alkali konsantre, 1:20 seyreltme. Gıda tesislerinde kullanıma uygun (NSF A1 muadili), 20 L bidon.", brand: "Toros Kimya", mpn: "TK-YS-20", unit: "adet", kw: ["yağ sökücü", "endüstriyel temizlik", "alkali"], img: "cleaning,chemical", price: 1450, moq: 4 },
  { owner: "toros", name: "Polielektrolit Anyonik Flokülant 25 kg", cat: "12352300", catKw: "polimer", desc: "Atık su arıtma için yüksek molekül ağırlıklı anyonik polielektrolit. Çamur susuzlaştırma ve çöktürme; 25 kg torba, dozaj danışmanlığı dahil.", brand: "Toros Kimya", unit: "kg", kw: ["flokülant", "polielektrolit", "arıtma"], img: "water,treatment", moq: 25 },
  // karadeniz
  { owner: "karadeniz", name: "Kuru Tip Trafo 1000 kVA 34,5/0,4 kV", cat: "39121000", catKw: "trafo", desc: "Reçine döküm kuru tip dağıtım trafosu, 1000 kVA, 34,5/0,4 kV, Dyn11. IEC 60076-11, 2 yıl garanti; devreye alma hizmeti opsiyonel.", brand: "Karadeniz", unit: "adet", kw: ["trafo", "kuru tip", "dağıtım trafosu", "34.5 kV"], img: "transformer,electric", moq: 1 },
  { owner: "karadeniz", name: "GES Kurulumu (Çatı) — kW Başına", cat: "26111700", catKw: "güneş", desc: "Sanayi çatısına anahtar teslim güneş enerjisi santrali: panel, inverter, konstrüksiyon, AG pano ve şebeke bağlantı projesi. 25 yıl panel performans garantisi.", brand: "Karadeniz", unit: "kW", kw: ["GES", "güneş enerjisi", "çatı GES", "EPC"], img: "solar,roof", price: 19500, moq: 100 },
  { owner: "karadeniz", name: "Kompanzasyon Panosu 400 kVAr", cat: "39121000", catKw: "pano", desc: "Reaktif güç kompanzasyon panosu, 400 kVAr, 12 kademe, harmonik filtreli. Pano içi bakır bara, kontaktörler Schneider; devreye alma dahil.", brand: "Karadeniz", unit: "adet", kw: ["kompanzasyon", "pano", "reaktif güç"], img: "electrical,panel", price: 185000, moq: 1 },
  // baskent
  { owner: "baskent", name: "Nitril Muayene Eldiveni Pudrasız (100'lü)", cat: "42132200", desc: "Pudrasız, lateks içermeyen nitril muayene eldiveni; S–XL, mavi, 100'lük kutu, kolide 10 kutu. EN 455, CE, tek kullanımlık.", brand: "MedSafe", mpn: "MS-NTR-100", unit: "kutu", kw: ["eldiven", "nitril", "muayene", "tıbbi sarf"], img: "gloves,medical", tiers: [{ minQty: 10, unitPrice: 165 }, { minQty: 100, unitPrice: 149 }, { minQty: 1000, unitPrice: 138 }], moq: 10 },
  { owner: "baskent", name: "Tek Kullanımlık Enjektör 5 ml (Kilitli)", cat: "42142500", catKw: "enjektör", desc: "Luer-lock 5 ml enjektör, 21G iğneli, steril, tekli blister. Koli 1.000 adet; hastane ve klinik tedariki için palet bazında sevkiyat.", brand: "MedSafe", unit: "adet", kw: ["enjektör", "şırınga", "luer lock"], img: "syringe,medical", price: 2.9, moq: 1000 },
  { owner: "baskent", name: "Hasta Monitörü 12\" (EKG, SpO2, NIBP)", cat: "42181500", catKw: "monitör", desc: "Taşınabilir hasta başı monitörü: 5 kanal EKG, SpO2, NIBP, sıcaklık, 12\" dokunmatik ekran, 4 saat batarya. CE, 2 yıl garanti, eğitim dahil.", brand: "VitaCare", unit: "adet", kw: ["hasta monitörü", "EKG", "SpO2"], img: "hospital,monitor", moq: 1 },
  // akdeniz
  { owner: "akdeniz", name: "Soğuk Hava Deposu Kiralama (Palet/Ay)", cat: "78131600", catKw: "depolama", desc: "Mersin'de -18°C ve +4°C soğuk depo, palet-ay bazında kiralama. WMS ile stok görünürlüğü, 7/24 giriş-çıkış, sigortalı depolama.", brand: "Akdeniz Lojistik", unit: "palet", kw: ["soğuk depo", "depolama", "Mersin"], img: "cold,warehouse", price: 420, moq: 20 },
  { owner: "akdeniz", name: "Komple Tır Nakliye İstanbul–Mersin", cat: "78101800", catKw: "nakliye", desc: "13,6 m tenteli tır ile komple yük taşıma, İstanbul–Mersin arası 24 saat teslim. Sigortalı, GPS takipli, e-irsaliye entegrasyonu.", brand: "Akdeniz Lojistik", unit: "sefer", kw: ["nakliye", "tır", "komple yük"], img: "truck,highway", price: 28500, moq: 1 },
  // metal
  { owner: "metal", name: "Lazer Kesim Sac Parça (DKP 2 mm)", cat: "31163200", catKw: "kesim", desc: "Fiber lazer ile DKP 2 mm sac parça kesimi; çizime göre üretim, 6 kW lazer, ±0,1 mm tolerans. Kilogram bazında fiyat, DXF/DWG ile teklif.", brand: "İç Anadolu Metal", unit: "kg", kw: ["lazer kesim", "sac parça", "fason"], img: "laser,cutting", price: 62, moq: 100 },
  { owner: "metal", name: "Kutu Profil 40x40x2 mm (6 m)", cat: "30102300", desc: "S235JR sıcak haddelenmiş kutu profil 40x40x2 mm, 6 m boy, ~14 kg. Ton bazında sevkiyat, Konya depodan aynı gün yükleme.", brand: "İç Anadolu Metal", unit: "adet", kw: ["kutu profil", "çelik profil", "40x40"], img: "steel,profile", tiers: [{ minQty: 50, unitPrice: 690 }, { minQty: 500, unitPrice: 645 }], moq: 50 },
  { owner: "metal", name: "CNC Freze İşleme Hizmeti (Saat)", cat: "73171600", catKw: "talaşlı", desc: "3 ve 5 eksen CNC freze ile alüminyum ve çelik parça işleme. 20 tezgah, CAM programlama dahil, CMM ölçüm raporu; saatlik ya da parça bazlı teklif.", brand: "İç Anadolu Metal", unit: "saat", kw: ["CNC", "freze", "talaşlı imalat"], img: "cnc,machine", price: 1250, moq: 8 },
  { owner: "metal", name: "Elektrostatik Toz Boya Hizmeti (m²)", cat: "73171600", catKw: "boya", desc: "Metal parça ve profillerde RAL kartelasına göre elektrostatik toz boya; 6 m fırın, ön yıkama hattı. m² bazında fiyat, 3 gün termin.", brand: "İç Anadolu Metal", unit: "m²", kw: ["toz boya", "elektrostatik", "RAL"], img: "powder,coating", price: 145, moq: 20 },
  // yildiz
  { owner: "yildiz", name: "Fotokopi Kağıdı A4 80 g (5'li Koli)", cat: "14111500", catKw: "kağıt", desc: "A4 80 g/m² fotokopi kağıdı, 500 yaprak × 5 paket. Tüm yazıcı ve fotokopi makineleriyle uyumlu, FSC sertifikalı; İstanbul içi ertesi gün teslim.", brand: "Yıldız", unit: "koli", kw: ["A4 kağıt", "fotokopi kağıdı", "kırtasiye"], img: "paper,office", tiers: [{ minQty: 10, unitPrice: 690 }, { minQty: 100, unitPrice: 655 }], moq: 10 },
  { owner: "yildiz", name: "Ergonomik Ofis Koltuğu (Fileli)", cat: "56112100", catKw: "koltuk", desc: "Ayarlanabilir bel desteği, 3D kolçak, fileli sırt, 120 kg taşıma. 5 yıl garanti, montajlı teslim; kurumsal projede özel kumaş seçeneği.", brand: "Yıldız", unit: "adet", kw: ["ofis koltuğu", "ergonomik", "ofis mobilyası"], img: "office,chair", price: 4850, moq: 5 },
  // demir
  { owner: "demir", name: "Galvanizli Altıköşe Cıvata M12x50 (DIN 933) 8.8", cat: "31161500", desc: "8.8 kalite, sıcak daldırma galvanizli altıköşe başlı cıvata M12x50, DIN 933. Kutu 100 adet; çelik konstrüksiyon ve makine montajı için.", brand: "FixPro", mpn: "FP-933-1250", unit: "adet", kw: ["cıvata", "DIN 933", "galvaniz", "bağlantı elemanı"], img: "bolts,hardware", tiers: [{ minQty: 100, unitPrice: 9.8 }, { minQty: 5000, unitPrice: 8.4 }], moq: 100 },
  { owner: "demir", name: "Akülü Matkap/Vidalama 18V 2 Ah (2 Akü)", cat: "27112700", catKw: "matkap", desc: "18V fırçasız motorlu darbeli matkap/vidalama, 60 Nm, 2 × 2 Ah akü ve şarj cihazı ile taşıma çantasında. 2 yıl garanti, yetkili servis.", brand: "PowerTek", unit: "adet", kw: ["matkap", "akülü", "el aleti"], img: "drill,tool", price: 3290, moq: 1 },
  { owner: "demir", name: "Kesme Diski 115x1 mm Inox (25'li)", cat: "23131500", catKw: "disk", desc: "Paslanmaz çelik için ince kesme diski 115x1,0x22,2 mm, 25'li paket. EN 12413, 13.300 d/dk; avuç taşlama makineleriyle uyumlu.", brand: "PowerTek", unit: "paket", kw: ["kesme diski", "inox", "taşlama"], img: "grinder,disc", price: 285, moq: 4 },
  // gunes
  { owner: "gunes", name: "Fabrika Temizlik Hizmeti (Aylık, m²)", cat: "76111500", catKw: "temizlik", desc: "Üretim tesisleri için günlük genel temizlik, makine çevresi ve sosyal alanlar; personel, ekipman ve sarf dahil. m²/ay bazında sözleşme, SLA raporu.", brand: "Güneş", unit: "m²", kw: ["fabrika temizliği", "endüstriyel temizlik", "tesis hizmeti"], img: "cleaning,industrial", price: 18, moq: 1000 },
  { owner: "gunes", name: "Dış Cephe ve Cam Temizliği (m²)", cat: "76111500", catKw: "cephe", desc: "İple erişim ve platformla dış cephe cam temizliği; yüksekte çalışma sertifikalı ekip, sigortalı. m² bazında, plaza ve AVM referansları.", brand: "Güneş", unit: "m²", kw: ["dış cephe", "cam temizliği", "iple erişim"], img: "window,cleaning", price: 42, moq: 500 },
  // mavi
  { owner: "mavi", name: "Depo Yönetim Yazılımı (WMS) — Kullanıcı/Ay", cat: "81162000", desc: "Barkod ve el terminali destekli bulut depo yönetimi: mal kabul, adresleme, toplama, sayım ve ERP entegrasyonu. Kullanıcı başına aylık, kurulum ve eğitim dahil.", brand: "MaviWMS", unit: "kullanıcı", kw: ["WMS", "depo yazılımı", "SaaS", "barkod"], img: "warehouse,software", price: 1290, moq: 5 },
  { owner: "mavi", name: "ERP Entegrasyon Danışmanlığı (Adam/Gün)", cat: "81111800", catKw: "danışmanlık", desc: "Logo, Netsis, SAP B1 ile e-ticaret, saha ve üretim sistemleri arasında entegrasyon. Analiz, geliştirme ve devreye alma; adam/gün bazında teklif.", brand: "Mavi Bilişim", unit: "gün", kw: ["ERP", "entegrasyon", "danışmanlık"], img: "software,developer", price: 9500, moq: 5 },
  // bursa-oto
  { owner: "bursa-oto", name: "Kaynaklı Şasi Traversi (OEM Parça)", cat: "25171700", catKw: "şasi", desc: "Robotik MAG kaynaklı şasi traversi, S420MC sac, KTL kaplama. OEM çizimine göre üretim, PPAP dosyası ve %100 fikstür kontrolü.", brand: "Bursa Oto", unit: "adet", kw: ["şasi", "travers", "OEM", "kaynaklı parça"], img: "automotive,welding", moq: 500 },
  { owner: "bursa-oto", name: "Pres Baskı Sac Parça (2–6 mm)", cat: "31163200", catKw: "pres", desc: "400–1.000 ton preslerde progresif ve transfer kalıpla sac parça üretimi. Otomotiv ve beyaz eşya; kalıp tasarımı dahil, IATF 16949.", brand: "Bursa Oto", unit: "adet", kw: ["pres", "sac parça", "progresif kalıp"], img: "press,metal", moq: 1000 },
  { owner: "bursa-oto", name: "Fren Diski Havalı 300 mm (Aftermarket)", cat: "25172400", catKw: "fren", desc: "Havalı fren diski 300 mm, GG20 döküm, balanslı; hafif ticari araçlar için aftermarket. ECE R90, 2 yıl garanti, kolide 2 adet.", brand: "Bursa Oto", mpn: "BO-FD-300V", unit: "adet", kw: ["fren diski", "aftermarket", "yedek parça"], img: "brake,disc", tiers: [{ minQty: 20, unitPrice: 1650 }, { minQty: 200, unitPrice: 1480 }], moq: 20 },
  // kocaeli-plastik
  { owner: "kocaeli-plastik", name: "PET Şişe 500 ml (Preform + Şişirme)", cat: "24121800", catKw: "şişe", desc: "500 ml PET şişe, 28 mm PCO 1881 ağız, 18 g; su, meyve suyu ve kimyasal dolum için. Şeffaf ve mavi tonlu, palet bazında (10.000 adet).", brand: "Kocaeli Plastik", unit: "adet", kw: ["PET şişe", "ambalaj", "500 ml"], img: "plastic,bottle", tiers: [{ minQty: 10000, unitPrice: 2.35 }, { minQty: 100000, unitPrice: 2.1 }], moq: 10000 },
  { owner: "kocaeli-plastik", name: "HDPE Bidon 20 L UN Onaylı", cat: "24121800", catKw: "bidon", desc: "Kimyasal ve gıda taşımaya uygun 20 L HDPE bidon, UN 3H1 onaylı, DIN 61 kapak. Lacivert/beyaz, baskılı etiket seçeneği; palette 120 adet.", brand: "Kocaeli Plastik", unit: "adet", kw: ["bidon", "HDPE", "UN onaylı", "kimyasal ambalaj"], img: "plastic,container", price: 68, moq: 120 },
  { owner: "kocaeli-plastik", name: "Streç Film 17 µ 500 mm (Makine Tipi)", cat: "24122000", catKw: "film", desc: "Makine tipi palet streç film 17 mikron, 500 mm, 1.800 m; %250 ön gerdirme. Koli 6 rulo, kamyon bazında özel fiyat.", brand: "Kocaeli Plastik", unit: "rulo", kw: ["streç film", "palet", "ambalaj"], img: "stretch,film", price: 415, moq: 30 },
  // izmir-makina
  { owner: "izmir-makina", name: "Paslanmaz Karıştırıcılı Proses Tankı 2.000 L", cat: "23181500", catKw: "tank", desc: "AISI 316L, 2.000 L ceketli karıştırıcılı tank; CIP sprey topu, 0,75 kW redüktörlü karıştırıcı, PT100. Gıda ve kozmetik için, CE/PED.", brand: "İzmir Makina", unit: "adet", kw: ["proses tankı", "paslanmaz tank", "karıştırıcı"], img: "stainless,tank", moq: 1 },
  { owner: "izmir-makina", name: "Modüler Bant Konveyör (Metre)", cat: "24101500", catKw: "konveyör", desc: "Paslanmaz gövdeli modüler plastik bantlı konveyör, 400–800 mm genişlik, hız kontrollü tahrik. Gıda hattı için yıkanabilir tasarım; metre bazında.", brand: "İzmir Makina", unit: "m", kw: ["konveyör", "bant konveyör", "gıda hattı"], img: "conveyor,belt", price: 38500, moq: 3 },
  { owner: "izmir-makina", name: "Vidalı Hava Kompresörü 37 kW 10 bar", cat: "40151600", desc: "37 kW, 10 bar, 6,2 m³/dk vidalı kompresör; invertörlü, entegre kurutucu opsiyonu. Kurulum ve 2 yıl garanti dahil, yedek parça stoğu İzmir.", brand: "AirMax", mpn: "AM-37-10", unit: "adet", kw: ["kompresör", "vidalı kompresör", "basınçlı hava"], img: "compressor,industrial", price: 465000, moq: 1 },
  // antalya-tarim
  { owner: "antalya-tarim", name: "Salkım Domates (Sera, İhracat Kalite)", cat: "50301600", catKw: "domates", desc: "GlobalGAP sertifikalı sera salkım domatesi, 5 kg karton koli, günlük hasat. Kasım–Haziran sezonu, tır bazında soğuk zincirle sevkiyat.", brand: "Antalya Tarım", unit: "kg", kw: ["domates", "sera", "ihracat", "GlobalGAP"], img: "tomato,greenhouse", price: 42, moq: 1000 },
  { owner: "antalya-tarim", name: "Kapya Biber 1. Sınıf", cat: "50301600", catKw: "biber", desc: "Sera kapya biber, 1. sınıf, 8 kg koli; salça ve konserve sanayine ve ihracata. Haftalık 200 ton kapasite, sözleşmeli üretim mümkün.", brand: "Antalya Tarım", unit: "kg", kw: ["kapya biber", "sera", "sözleşmeli üretim"], img: "red,pepper", price: 36, moq: 1000 },
  // trakya-elektrik
  { owner: "trakya-elektrik", name: "NYY Kablo 4x16 mm² (Metre)", cat: "26121600", desc: "0,6/1 kV NYY bakır iletkenli PVC yalıtımlı enerji kablosu 4x16 mm², TSE, 500 m makara. Şantiye teslimi, proje bazında özel fiyat.", brand: "Trakya Elektrik", unit: "m", kw: ["NYY kablo", "enerji kablosu", "4x16"], img: "electric,cable", tiers: [{ minQty: 100, unitPrice: 385 }, { minQty: 1000, unitPrice: 362 }], moq: 100 },
  { owner: "trakya-elektrik", name: "LED Panel Armatür 60x60 40 W", cat: "39111500", desc: "60x60 cm sıva altı LED panel, 40 W, 4.000 lm, 4000K, UGR<19; ofis ve mağaza aydınlatması. TSE, 3 yıl garanti, koli 4 adet.", brand: "LumiTek", unit: "adet", kw: ["LED panel", "aydınlatma", "60x60"], img: "led,office", price: 890, moq: 20 },
  { owner: "trakya-elektrik", name: "Sıva Altı Dağıtım Panosu 36 Modül", cat: "39121000", catKw: "pano", desc: "Sıva altı 36 modül metal dağıtım panosu, IP40, şeffaf kapak, bara ve klemens dahil. Konut ve ofis projeleri için, koli 4 adet.", brand: "Trakya Elektrik", unit: "adet", kw: ["dağıtım panosu", "sigorta kutusu", "36 modül"], img: "electrical,panel", price: 1150, moq: 4 },
  // kayseri-mobilya
  { owner: "kayseri-mobilya", name: "Ofis Çalışma Masası 160x80 (Metal Ayak)", cat: "56112100", catKw: "masa", desc: "Melamin kaplı 25 mm tabla, toz boyalı metal ayak, kablo kanalı. 160x80 cm, 10 renk; proje bazında özel ölçü ve montajlı teslim.", brand: "Kayseri Mobilya", unit: "adet", kw: ["ofis masası", "çalışma masası", "ofis mobilyası"], img: "office,desk", tiers: [{ minQty: 10, unitPrice: 5900 }, { minQty: 100, unitPrice: 5250 }], moq: 10 },
  { owner: "kayseri-mobilya", name: "Otel Odası Mobilya Seti (Proje)", cat: "56101500", catKw: "mobilya", desc: "Yatak başlığı, komodin, bagaj sehpası, çalışma masası ve dolap; otel projeleri için özel tasarım set. FSC sertifikalı MDF, laminat ve kaplama seçenekleri.", brand: "Kayseri Mobilya", unit: "set", kw: ["otel mobilyası", "proje mobilyası"], img: "hotel,room", moq: 20 },
  // samsun-ambalaj
  { owner: "samsun-ambalaj", name: "Oluklu Koli 40x30x30 cm (5 Katlı)", cat: "14121506", desc: "BC dalga 5 katlı oluklu mukavva koli 40x30x30 cm, 25 kg taşıma. 1 renk flekso baskı dahil; palet 500 adet, özel ölçü 5 gün termin.", brand: "Samsun Ambalaj", unit: "adet", kw: ["oluklu koli", "karton kutu", "5 katlı"], img: "cardboard,box", tiers: [{ minQty: 500, unitPrice: 28 }, { minQty: 5000, unitPrice: 24.5 }], moq: 500 },
  { owner: "samsun-ambalaj", name: "Fındık İhracat Kolisi 25 kg", cat: "14121506", desc: "Fındık ve kuruyemiş ihracatı için 25 kg kapasiteli 3 katlı koli, nem bariyerli iç kaplama, 2 renk baskı. Haftalık 100 bin adet kapasite.", brand: "Samsun Ambalaj", unit: "adet", kw: ["fındık kolisi", "ihracat ambalajı"], img: "hazelnut,box", price: 19.5, moq: 1000 },
  // anadolu (hizmet ürünleri)
  { owner: "anadolu", name: "Prefabrik Şantiye Konteyneri 7 m (Kiralık)", cat: "72121400", catKw: "prefabrik", desc: "Ofis ve yatakhane tipi 7 m prefabrik konteyner kiralama; elektrik, klima ve mobilya dahil. Ay bazında, kurulum ve nakliye Türkiye geneli.", brand: "Anadolu", unit: "ay", kw: ["şantiye konteyneri", "prefabrik", "kiralık"], img: "container,site", price: 6500, moq: 3 },
  { owner: "anadolu", name: "Endüstriyel Zemin Betonu (Helikopter Perdahlı, m²)", cat: "72121400", catKw: "beton", desc: "Fabrika ve depo zeminleri için çelik lifli C30 beton, yüzey sertleştirici ve helikopter perdah. m² bazında, 7 gün kür sonrası teslim.", brand: "Anadolu", unit: "m²", kw: ["endüstriyel zemin", "perdah beton", "depo zemini"], img: "concrete,floor", price: 720, moq: 500 },
  // akdeniz ek
  { owner: "akdeniz", name: "Gümrükleme Hizmeti (Beyanname Başına)", cat: "78131600", catKw: "gümrük", desc: "İthalat ve ihracat gümrük müşavirliği; beyanname, tarife danışmanlığı, Mersin ve Ambarlı limanlarında operasyon. Beyanname başına sabit ücret.", brand: "Akdeniz Lojistik", unit: "adet", kw: ["gümrükleme", "gümrük müşavirliği", "ithalat"], img: "port,container", price: 2400, moq: 1 },
  // baskent ek
  { owner: "baskent", name: "Cerrahi Maske Tip IIR (50'li)", cat: "42131700", catKw: "maske", desc: "3 katlı cerrahi maske Tip IIR, EN 14683, %98 BFE, 50'lik kutu, kolide 40 kutu. CE belgeli, hastane ihalelerine uygun raporlar mevcut.", brand: "MedSafe", unit: "kutu", kw: ["cerrahi maske", "tip IIR", "tıbbi sarf"], img: "surgical,mask", tiers: [{ minQty: 40, unitPrice: 48 }, { minQty: 400, unitPrice: 42 }], moq: 40 },
  // izmir ek
  { owner: "izmir-makina", name: "Plakalı Isı Eşanjörü 150 kW", cat: "40101800", catKw: "eşanjör", desc: "Contalı plakalı ısı eşanjörü 150 kW, AISI 316 plaka, EPDM conta; gıda ve HVAC uygulamaları. Termal hesap ve seçim mühendislik ekibimizce yapılır.", brand: "İzmir Makina", unit: "adet", kw: ["eşanjör", "ısı değiştirici", "plakalı"], img: "heat,exchanger", price: 96000, moq: 1 },
  // metal ek
  { owner: "metal", name: "Paslanmaz Sac 304 2B 1,5 mm (1250x2500)", cat: "30264800", catKw: "paslanmaz", desc: "AISI 304 2B yüzey paslanmaz sac 1,5 mm, 1250x2500 mm, PVC koruma filmli. Ton bazında, sertifikalı (3.1 EN 10204); gıda ve mutfak imalatı için.", brand: "İç Anadolu Metal", unit: "adet", kw: ["paslanmaz sac", "304", "2B"], img: "stainless,sheet", price: 4150, moq: 10 },
  // yildiz ek
  { owner: "yildiz", name: "Toner Kartuş (Uyumlu) HP 26A", cat: "44103100", catKw: "toner", desc: "HP CF226A uyumlu toner kartuşu, 3.100 sayfa, ISO 19752; 1 yıl garanti. Kurumsal tedarikte aylık fatura ve toplu sipariş indirimi.", brand: "PrintFine", mpn: "PF-26A", unit: "adet", kw: ["toner", "kartuş", "HP 26A"], img: "printer,toner", price: 640, moq: 2 },
];

/* ───────────────────────── İlanlar ───────────────────────── */
type Item = { name: string; quantity: number; unit: string; targetPrice?: number; buyNow?: number; img?: string };
type L = {
  owner: string; type: "ALIM" | "SATIS"; title: string; desc: string; cat: string; catKw?: string; items: Item[];
  closesInDays: number; intl?: boolean; deliveryTerm?: "EXW" | "FCA" | "DAP" | "DDP" | "FOB" | "CIF";
  minPrice?: number; buyNowPrice?: number; keywords?: string[]; requireAll?: boolean;
};
const LISTINGS: L[] = [
  { owner: "anadolu", type: "ALIM", closesInDays: 14, cat: "30111500", catKw: "beton", title: "Şantiye için inşaat demiri ve çimento alımı", desc: "Ankara Yenimahalle'deki konut projemiz için 6 aylık demir ve çimento tedariki. Teslimat şantiyeye, aylık partiler hâlinde; TSE belgeli üretici veya yetkili bayi teklifleri değerlendirilecektir.", deliveryTerm: "DAP", keywords: ["inşaat demiri", "çimento", "hazır beton"], requireAll: true,
    items: [{ name: "İnşaat demiri Ø12 (S420)", quantity: 25000, unit: "kg", targetPrice: 26 }, { name: "Portland çimento CEM I 42.5 R (50 kg)", quantity: 800, unit: "torba", targetPrice: 210 }, { name: "Hazır beton C30/37", quantity: 120, unit: "m³", targetPrice: 2400 }] },
  { owner: "ege", type: "ALIM", closesInDays: 10, cat: "11151600", title: "Pamuk ipliği ve reaktif boya tedariki", desc: "Sonbahar üretim planı için Ne 30/1 penye iplik ve reaktif boya alımı. Numune onayı sonrası aylık teslimat; İzmir fabrikaya DAP teslim, 60 gün vade tercih edilir.", deliveryTerm: "DAP", keywords: ["iplik", "reaktif boya", "tekstil kimyasalı"],
    items: [{ name: "Ne 30/1 penye pamuk ipliği", quantity: 5000, unit: "kg" }, { name: "Reaktif boya — lacivert", quantity: 400, unit: "kg" }, { name: "Fikse maddesi", quantity: 200, unit: "kg" }] },
  { owner: "marmara", type: "ALIM", closesInDays: 7, cat: "24121800", catKw: "şişe", title: "PET şişe, şeker ve oluklu koli alımı", desc: "Yaz sezonu meyve suyu ve konserve üretimi için ambalaj ve hammadde. PET şişe 28 mm PCO ağızlı; şeker ICUMSA 45; koli 5 katlı. Bursa tesise haftalık teslimat.", deliveryTerm: "DAP", keywords: ["PET şişe", "kristal şeker", "oluklu koli"],
    items: [{ name: "PET şişe 500 ml (28 mm PCO 1881)", quantity: 100000, unit: "adet" }, { name: "Kristal şeker ICUMSA 45", quantity: 12000, unit: "kg" }, { name: "Oluklu karton koli 40x30x25", quantity: 5000, unit: "adet" }] },
  { owner: "toros", type: "ALIM", closesInDays: 21, cat: "12352300", catKw: "hidroksit", title: "Endüstriyel kimyasal hammadde tedariki", desc: "Üretim hattımız için dökme ve torbalı kimyasal alımı; analiz sertifikası zorunlu. Adana OSB'ye tanker veya paletli teslimat, aylık çağrılı sevkiyat.", deliveryTerm: "DAP", keywords: ["kostik", "sülfürik asit", "sodyum bikarbonat"],
    items: [{ name: "Kostik soda %99 (pul)", quantity: 3000, unit: "kg" }, { name: "Sülfürik asit %98", quantity: 1500, unit: "L" }, { name: "Sodyum bikarbonat", quantity: 2000, unit: "kg" }] },
  { owner: "karadeniz", type: "ALIM", closesInDays: 18, cat: "39121000", catKw: "trafo", title: "Trafo merkezi için trafo, kablo ve pano alımı", desc: "Samsun'daki 3 MW GES bağlantısı için kuru tip trafo, OG kablo ve kompanzasyon panosu. Teklife tip test raporları ve devreye alma dahil edilmeli.", deliveryTerm: "DDP", keywords: ["kuru tip trafo", "NYY kablo", "kompanzasyon"],
    items: [{ name: "Kuru tip trafo 1000 kVA 34,5/0,4 kV", quantity: 3, unit: "adet" }, { name: "NYY kablo 4x16", quantity: 2000, unit: "m" }, { name: "Kompanzasyon panosu 400 kVAr", quantity: 2, unit: "adet" }] },
  { owner: "baskent", type: "ALIM", closesInDays: 12, cat: "42132200", title: "Hastane tıbbi sarf malzeme alımı (6 aylık)", desc: "Anlaşmalı hastane grubu için 6 aylık sarf malzeme çerçeve alımı. CE ve ÜTS kaydı zorunlu; teslimat Ankara merkez depoya aylık partiler hâlinde.", deliveryTerm: "DAP", keywords: ["eldiven", "enjektör", "antiseptik", "ÜTS"], requireAll: true,
    items: [{ name: "Nitril muayene eldiveni (M)", quantity: 50000, unit: "adet" }, { name: "Enjektör 5 ml luer-lock", quantity: 100000, unit: "adet" }, { name: "Antiseptik solüsyon 1 L", quantity: 800, unit: "adet" }] },
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
  { owner: "mavi", type: "ALIM", closesInDays: 19, cat: "43211500", catKw: "bilgisayar", title: "Saha ekibi için el terminali ve tablet alımı", desc: "WMS projeleri için Android el terminali ve endüstriyel tablet. IP65, barkod okuyuculu, 2 yıl garanti; İstanbul'a teslim, MDM lisansı ayrı kalemde.", deliveryTerm: "DAP", keywords: ["el terminali", "endüstriyel tablet", "barkod"],
    items: [{ name: "Android el terminali (2D barkod)", quantity: 150, unit: "adet" }, { name: "Endüstriyel tablet 10\" IP65", quantity: 40, unit: "adet" }, { name: "Şarj standı 5'li", quantity: 40, unit: "adet" }] },
  { owner: "kayseri-mobilya", type: "ALIM", closesInDays: 22, cat: "11121600", catKw: "MDF", title: "MDF, laminat ve kenar bandı alımı (yıllık)", desc: "Otel projeleri için yıllık levha ve kenar bandı çerçeve alımı; FSC sertifikalı ürün tercih edilir. Kayseri fabrikaya aylık teslim, tır bazında fiyat.", deliveryTerm: "DAP", keywords: ["MDF", "laminat", "kenar bandı", "FSC"],
    items: [{ name: "MDF 18 mm 210x280 (FSC)", quantity: 6000, unit: "adet" }, { name: "Laminat kaplı sunta 18 mm", quantity: 4000, unit: "adet" }, { name: "PVC kenar bandı 22x1 mm", quantity: 50000, unit: "m" }] },
  { owner: "trakya-elektrik", type: "ALIM", closesInDays: 6, cat: "39111500", title: "Fabrika aydınlatma projesi için LED armatür alımı", desc: "Çerkezköy'de 8.000 m² üretim alanı LED dönüşümü. Yüksek tavan armatürleri DALI uyumlu, 5 yıl garanti; kurulum ayrı teklif olarak istenebilir.", deliveryTerm: "DAP", keywords: ["LED highbay", "aydınlatma projesi", "DALI"],
    items: [{ name: "LED highbay 150 W 150 lm/W", quantity: 220, unit: "adet" }, { name: "LED etanj armatür 1500 mm 50 W", quantity: 180, unit: "adet" }, { name: "Acil aydınlatma kiti", quantity: 60, unit: "adet" }] },
  // SATIŞ ilanları
  { owner: "ege", type: "SATIS", closesInDays: 16, cat: "11162100", catKw: "kumaş", title: "Parti sonu pamuklu kumaş satışı (200 top)", desc: "Sezon sonu stok: 180 g/m² süprem pamuklu kumaş, karışık renk, 25–30 kg toplar. Toplu satış tercih edilir; İzmir depodan teslim, hemen al fiyatı tüm parti için.", deliveryTerm: "EXW", minPrice: 80000, buyNowPrice: 120000, keywords: ["parti sonu", "pamuklu kumaş", "stok"],
    items: [{ name: "Pamuklu süprem kumaş topu (karışık renk)", quantity: 200, unit: "top", buyNow: 600, img: "cotton,fabric" }] },
  { owner: "marmara", type: "SATIS", closesInDays: 13, cat: "50192400", catKw: "konserve", title: "Toptan konserve gıda satışı (raf ömrü 18 ay+)", desc: "Fazla üretim: domates konservesi ve bezelye, palet bazında toptan satış. Bursa depodan teslim; ihracat evrakı hazırlanabilir.", deliveryTerm: "EXW", minPrice: 150000, keywords: ["konserve", "toptan gıda", "palet"],
    items: [{ name: "Domates konservesi 400 g", quantity: 20000, unit: "adet", buyNow: 14, img: "canned,tomato" }, { name: "Bezelye konservesi 400 g", quantity: 10000, unit: "adet", buyNow: 21, img: "canned,peas" }] },
  { owner: "metal", type: "SATIS", closesInDays: 12, cat: "30264800", catKw: "sac", title: "Stok fazlası paslanmaz sac satışı (304, 1,5 mm)", desc: "Proje iptali nedeniyle 8 ton AISI 304 2B paslanmaz sac, 1250x2500, PVC filmli, 3.1 sertifikalı. Konya depodan forkliftle yükleme.", deliveryTerm: "EXW", minPrice: 900000, buyNowPrice: 1050000, keywords: ["paslanmaz sac", "stok fazlası", "304"],
    items: [{ name: "Paslanmaz sac 304 2B 1,5 mm 1250x2500", quantity: 270, unit: "adet", buyNow: 3890, img: "stainless,sheet" }] },
  { owner: "izmir-makina", type: "SATIS", closesInDays: 25, cat: "23181500", catKw: "tank", title: "İkinci el paslanmaz proses tankı 3.000 L (revizyonlu)", desc: "2019 model AISI 316L ceketli karıştırıcılı tank, tam revizyonlu, yeni conta ve motor. Çalışır durumda görülebilir; İzmir tesisten teslim, montaj opsiyonel.", deliveryTerm: "EXW", minPrice: 380000, buyNowPrice: 450000, keywords: ["ikinci el", "proses tankı", "paslanmaz"],
    items: [{ name: "Paslanmaz ceketli tank 3.000 L (revizyonlu)", quantity: 1, unit: "adet", buyNow: 450000, img: "stainless,tank" }] },
  { owner: "bursa-oto", type: "SATIS", closesInDays: 14, cat: "25172400", catKw: "fren", title: "Aftermarket fren diski stok satışı (2.000 adet)", desc: "Model değişikliği nedeniyle 300 mm havalı fren diski stoku; ECE R90 belgeli, orijinal kolisinde. Bursa depodan palet bazında.", deliveryTerm: "EXW", minPrice: 2400000, keywords: ["fren diski", "stok", "aftermarket"],
    items: [{ name: "Havalı fren diski 300 mm", quantity: 2000, unit: "adet", buyNow: 1350, img: "brake,disc" }] },
  { owner: "kocaeli-plastik", type: "SATIS", closesInDays: 9, cat: "24121800", catKw: "bidon", title: "HDPE bidon 20 L stok satışı (UN onaylı, 6.000 adet)", desc: "Müşteri iptali: lacivert 20 L UN 3H1 bidon, DIN 61 kapaklı, paletli. Kocaeli fabrikadan teslim; 500'lük partilerle satılabilir.", deliveryTerm: "EXW", minPrice: 330000, buyNowPrice: 390000, keywords: ["HDPE bidon", "UN onaylı", "stok"],
    items: [{ name: "HDPE bidon 20 L UN 3H1", quantity: 6000, unit: "adet", buyNow: 65, img: "plastic,container" }] },
  { owner: "trakya-elektrik", type: "SATIS", closesInDays: 11, cat: "26121600", title: "Proje artığı NYY kablo satışı (4x16, 3.200 m)", desc: "Tamamlanan şantiyeden artan 500 m makaralarda NYY 4x16 mm² kablo, TSE, 2025 üretim. Çerkezköy depodan teslim; makara bazında satılır.", deliveryTerm: "EXW", minPrice: 1050000, buyNowPrice: 1180000, keywords: ["NYY kablo", "proje artığı", "4x16"],
    items: [{ name: "NYY kablo 4x16 mm² (500 m makara)", quantity: 3200, unit: "m", buyNow: 368, img: "electric,cable" }] },
  { owner: "kayseri-mobilya", type: "SATIS", closesInDays: 18, cat: "56112100", catKw: "masa", title: "Teşhir ürünü ofis mobilyası satışı (40 masa + 40 koltuk)", desc: "Fuar ve showroom teşhir ürünleri, sıfıra yakın; masa 160x80 metal ayak, koltuk fileli ergonomik. Kayseri'den teslim, toplu alımda montaj dahil.", deliveryTerm: "DAP", minPrice: 260000, buyNowPrice: 320000, keywords: ["ofis mobilyası", "teşhir", "toplu"],
    items: [{ name: "Ofis masası 160x80 (teşhir)", quantity: 40, unit: "adet", buyNow: 4200, img: "office,desk" }, { name: "Ergonomik koltuk (teşhir)", quantity: 40, unit: "adet", buyNow: 3800, img: "office,chair" }] },
];

const BIDS: { bidder: string; owner: string; titleIncludes: string; amount: number }[] = [
  { bidder: "trakya-elektrik", owner: "karadeniz", titleIncludes: "Trafo merkezi", amount: 2450000 },
  { bidder: "demir", owner: "metal", titleIncludes: "DKP", amount: 1290000 },
  { bidder: "kocaeli-plastik", owner: "marmara", titleIncludes: "PET şişe", amount: 615000 },
  { bidder: "samsun-ambalaj", owner: "antalya-tarim", titleIncludes: "karton koli", amount: 8400000 },
  { bidder: "toros", owner: "kocaeli-plastik", titleIncludes: "granül", amount: 5900000 },
  { bidder: "metal", owner: "bursa-oto", titleIncludes: "Rulman", amount: 740000 },
  { bidder: "trakya-elektrik", owner: "izmir-makina", titleIncludes: "motor", amount: 1120000 },
  { bidder: "yildiz", owner: "mavi", titleIncludes: "el terminali", amount: 3980000 },
];

/* ───────────────────────── Yardımcılar ───────────────────────── */
async function nextNumber(): Promise<string> {
  const rows = await prisma.$queryRaw<Array<{ n: bigint }>>`SELECT nextval('listing_number_seq') AS n`;
  return `ROT-${String(rows[0]!.n).padStart(6, "0")}`;
}
const catCache = new Map<string, string>();
/** Kod geçerliyse (discovery, L3+) onu; değilse anahtar kelimeyle en yakın L3'ü; o da yoksa kodun segmentindeki ilk L3. */
async function resolveCat(code: string, kw?: string): Promise<string> {
  const key = `${code}|${kw ?? ""}`;
  if (catCache.has(key)) return catCache.get(key)!;
  let found = await prisma.category.findFirst({ where: { id: code, inDiscovery: true, level: { gte: 3 } }, select: { id: true } });
  if (!found && kw) {
    found = await prisma.category.findFirst({
      where: { inDiscovery: true, level: 3, id: { startsWith: code.slice(0, 2) }, nameTr: { contains: kw, mode: "insensitive" } },
      select: { id: true }, orderBy: { id: "asc" },
    }) ?? await prisma.category.findFirst({
      where: { inDiscovery: true, level: 3, nameTr: { contains: kw, mode: "insensitive" } },
      select: { id: true }, orderBy: { id: "asc" },
    });
  }
  if (!found) {
    found = await prisma.category.findFirst({ where: { inDiscovery: true, level: 3, id: { startsWith: code.slice(0, 2) } }, select: { id: true }, orderBy: { id: "asc" } });
  }
  if (!found) throw new Error(`Kategori çözülemedi: ${code} (${kw ?? "-"})`);
  catCache.set(key, found.id);
  return found.id;
}
async function segmentCode(code: string) {
  const seg = `${code.slice(0, 2)}000000`;
  const ok = await prisma.category.findFirst({ where: { id: seg }, select: { id: true } });
  return ok ? seg : null;
}

/* ───────────────────────── Ana akış ───────────────────────── */
async function main() {
  console.log("🌱 Pazar yeri demo doluluğu…");
  // İDEMPOTENT: eski demo firmaları SİLİNMEZ (siparişleri var — FK). Sahip
  // e-postası eşleşen firma GÜNCELLENİR, yoksa oluşturulur. Ürünler ve açık
  // ilanlar her koşuda yeniden kurulur (teklifsiz olanlar).
  const id: Record<string, { companyId: string; ownerId: string; slug: string }> = {};
  let lock = 100;
  for (const d of COMPANIES) {
    const email = `${d.key}${DOMAIN}`;
    const authId = await ensureAuthUser(email);
    const sellerCats = (await Promise.all(d.sell.map(segmentCode))).filter((c): c is string => !!c);
    const buyerCats = (await Promise.all(d.buy.map(segmentCode))).filter((c): c is string => !!c);
    const publicProfile = d.publicProfile ?? true;
    const existingUser = await prisma.companyUser.findUnique({ where: { email }, select: { id: true, companyId: true, company: { select: { slug: true } } } });
    const data = {
      name: d.name, tier: d.tier, country: "TR", city: d.city, industry: d.industry,
      activities: d.activities, publicEnabled: publicProfile, publicListingsEnabled: true,
      aboutText: d.about, services: d.services, certifications: d.certs, photos: [img(d.cover, lock + 1, 900, 600), img(d.cover, lock + 2, 900, 600)],
      coverImageUrl: img(d.cover, lock, 1600, 500),
      foundedYear: d.founded, employeeCount: d.employees,
      website: `https://${d.key.replace(/-/g, "")}.example.com`,
      companyVerificationStatus: ((d.verified ?? true) ? "VERIFIED" : "UNVERIFIED") as "VERIFIED" | "UNVERIFIED",
      buyerCategoryIds: buyerCats, sellerCategoryIds: sellerCats,
      onboardingCompletedAt: new Date(), isActive: true, isBlocked: false, membershipEndAt: null,
    };
    lock += 10;
    let companyId: string; let ownerId: string; let slug: string;
    if (existingUser) {
      slug = existingUser.company.slug ?? generateSlug(d.name);
      while ((await prisma.company.count({ where: { slug, id: { not: existingUser.companyId } } })) > 0) slug = `${slug}-${Math.floor(Math.random() * 90 + 10)}`;
      await prisma.company.update({ where: { id: existingUser.companyId }, data: { ...data, slug } });
      await prisma.companyUser.update({ where: { id: existingUser.id }, data: { authId, roles: ["SAHIP"], isActive: true, deletedAt: null, emailVerifiedAt: new Date() } });
      companyId = existingUser.companyId; ownerId = existingUser.id;
    } else {
      let code = genCode();
      while ((await prisma.company.count({ where: { rothernId: code } })) > 0) code = genCode();
      slug = generateSlug(d.name);
      while ((await prisma.company.count({ where: { slug } })) > 0) slug = `${slug}-${Math.floor(Math.random() * 90 + 10)}`;
      const company = await prisma.company.create({ data: { ...data, rothernId: code, slug } });
      const firstName = d.name.split(" ")[0] ?? d.name;
      const user = await prisma.companyUser.create({
        data: { email, authId, firstName, lastName: "Yetkili", roles: ["SAHIP"], companyId: company.id, emailVerifiedAt: new Date() },
      });
      await prisma.company.update({ where: { id: company.id }, data: { ownerUserId: user.id } });
      companyId = company.id; ownerId = user.id;
    }
    // Eski demo ürünleri ve TEKLİFSİZ açık ilanları temizle (yeniden kurulacak).
    await prisma.companyItem.deleteMany({ where: { companyId } });
    // Demo teklifleri de sil (hepsi demo firmalardan) — yoksa teklifli ilan
    // kalır ve yeniden oluşturulan ilanla ÇİFTLENİR (2026-09-04'te yaşandı).
    await prisma.listingBid.deleteMany({ where: { listing: { companyId, status: "OPEN", orders: { none: {} } } } });
    await prisma.listing.deleteMany({ where: { companyId, status: "OPEN", orders: { none: {} } } });
    id[d.key] = { companyId, ownerId, slug };
    console.log(`  🏢 ${existingUser ? "güncellendi" : "oluşturuldu"} ${d.name} [${d.tier}] /firma/${slug}`);
  }

  for (const [a, b] of CONNECTIONS) {
    const exists = await prisma.companyConnection.findFirst({
      where: { OR: [{ inviterCompanyId: id[a]!.companyId, inviteeCompanyId: id[b]!.companyId }, { inviterCompanyId: id[b]!.companyId, inviteeCompanyId: id[a]!.companyId }] },
      select: { id: true },
    });
    if (exists) continue;
    await prisma.companyConnection.create({
      data: { inviterCompanyId: id[a]!.companyId, inviteeCompanyId: id[b]!.companyId, status: "ACTIVE", origin: "ADMIN", invitedById: id[a]!.ownerId, decidedAt: new Date() },
    });
  }
  console.log(`  🔗 ${CONNECTIONS.length} bağlantı`);

  let pLock = 1000;
  let productCount = 0;
  for (const p of PRODUCTS) {
    const o = id[p.owner]!;
    const categoryId = await resolveCat(p.cat, p.catKw);
    let slug = generateSlug(p.name);
    while ((await prisma.companyItem.count({ where: { companyId: o.companyId, slug } })) > 0) slug = `${slug}-2`;
    const priceMode = p.tiers ? "TIERED" : p.price != null ? "FIXED" : "ON_REQUEST";
    const like = {
      name: p.name, categoryId, description: p.desc, images: [img(p.img, pLock), img(p.img, pLock + 1)], keywords: p.kw,
      priceMode: priceMode as "FIXED" | "TIERED" | "ON_REQUEST", priceAmount: p.price ?? null, priceTiers: p.tiers ?? null, moq: p.moq ?? null, attributes: null,
    };
    const score = productCompletion(like).score;
    await prisma.companyItem.create({
      data: {
        companyId: o.companyId, createdById: o.ownerId, name: p.name, description: p.desc, specification: p.spec ?? null,
        brand: p.brand ?? null, mpn: p.mpn ?? null, unit: p.unit, categoryId, keywords: p.kw, images: like.images,
        priceMode, priceAmount: p.price ?? null, priceTiers: (p.tiers ?? undefined) as Prisma.InputJsonValue | undefined,
        priceCurrency: p.cur ?? "TRY", moq: p.moq ?? null, isPublic: true, publishedAt: new Date(Date.now() - Math.floor(Math.random() * 60 * 24) * 3_600_000),
        slug, completionScore: score, searchText: foldSearchText([p.name, p.brand ?? "", p.mpn ?? "", ...p.kw].join(" ")),
      },
    });
    pLock += 2;
    productCount++;
  }
  console.log(`  📦 ${productCount} ürün (yayında)`);

  const listingRef: { owner: string; title: string; listingId: string }[] = [];
  for (const l of LISTINGS) {
    const o = id[l.owner]!;
    const number = await nextNumber();
    const categoryId = await resolveCat(l.cat, l.catKw);
    const listing = await prisma.listing.create({
      data: {
        number, companyId: o.companyId, createdById: o.ownerId, type: l.type, format: l.type === "ALIM" ? "RFQ" : null,
        visibility: "PUBLIC", title: l.title, description: l.desc, status: "OPEN", publishedAt: days(-Math.floor(Math.random() * 5)),
        closesAt: days(l.closesInDays), primaryCurrency: "TRY", paymentTiming: "AFTER_DELIVERY",
        priceScope: l.type === "SATIS" ? "TOPLU" : "KALEM", minPrice: l.minPrice ?? null, buyNowPrice: l.buyNowPrice ?? null,
        categoryIds: [categoryId], keywords: l.keywords ?? [], isInternational: l.intl ?? false,
        deliveryTerm: l.deliveryTerm ?? null, requireAllItems: l.requireAll ?? false, publicIndexable: true,
      },
    });
    for (let i = 0; i < l.items.length; i++) {
      const it = l.items[i]!;
      await prisma.listingItem.create({
        data: {
          listingId: listing.id, lineNo: i + 1, name: it.name, quantity: it.quantity, unit: it.unit,
          targetPrice: it.targetPrice ?? null, buyNowUnitPrice: it.buyNow ?? null, images: it.img ? [img(it.img, pLock++)] : [],
        },
      });
    }
    listingRef.push({ owner: l.owner, title: l.title, listingId: listing.id });
  }
  console.log(`  📋 ${LISTINGS.length} ilan (${LISTINGS.filter((l) => l.type === "ALIM").length} alım talebi, ${LISTINGS.filter((l) => l.type === "SATIS").length} satış ilanı)`);

  let bidCount = 0;
  for (const b of BIDS) {
    const ref = listingRef.find((r) => r.owner === b.owner && r.title.includes(b.titleIncludes));
    if (!ref) continue;
    await prisma.listingBid.create({
      data: { listingId: ref.listingId, bidderCompanyId: id[b.bidder]!.companyId, createdById: id[b.bidder]!.ownerId, amount: b.amount, currency: "TRY", status: "SUBMITTED", submittedAt: new Date(), deliveryDate: days(20) },
    });
    bidCount++;
  }
  console.log(`  💰 ${bidCount} teklif`);
  console.log("\n✅ Tamam. Giriş: <key>@demofill.local / Demo1234! (ör. anadolu@demofill.local)");
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error("HATA:", e);
  await prisma.$disconnect();
  process.exit(1);
});
