/**
 * SEGMENT SLOGANLARI — kategori vitrini tanıtım kartının alt cümlesi
 * (2026-09-21, kullanıcı mockup'ı: "Daha aydınlık, daha verimli işletmeler
 * için çözümler."). 58 Ariba/UNSPSC segmenti, ilk iki hane → cümle.
 * Sayı/ölçü/iddia yok (uydurma sinyal basılmaz); yalnız alanın ne olduğunu
 * söyler. Bilinmeyen kod → nötr cümle.
 */
const TAGLINES: Record<string, string> = {
  "10": "Tarladan tesise canlı ve doğal ürünler.",
  "11": "Üretimin temelini oluşturan ham maddeler.",
  "12": "Her prosese uygun kimyasal çözümler.",
  "13": "Daha sürdürülebilir bir gelecek için ham maddeler.",
  "14": "Ambalajdan ofise kağıt ve karton ürünler.",
  "15": "Tesisinizi çalıştıran yakıt ve katkılar.",
  "20": "Yer altından yüzeye güçlü ekipmanlar.",
  "21": "Verimli hasat için doğru makineler.",
  "22": "Şantiyenin yükünü taşıyan makineler.",
  "23": "Üretim hattınız için makine ve donanım.",
  "24": "Depodan sevkiyata akıcı lojistik.",
  "25": "Filonuz için araç ve yedek parça.",
  "26": "Kesintisiz enerji için güç sistemleri.",
  "27": "Her atölyeye uygun alet ve makineler.",
  "30": "Temelden çatıya güvenilir malzeme.",
  "31": "Montaj hattınız için hassas bileşenler.",
  "32": "Devreden ürüne elektronik parçalar.",
  "39": "Daha aydınlık, daha verimli işletmeler için çözümler.",
  "40": "Isıtma, soğutma ve akışkan kontrolü.",
  "41": "Hassas ölçüm ve analiz ekipmanı.",
  "42": "Sağlık kuruluşları için tıbbi donanım.",
  "43": "Dijital altyapı için yazılım ve donanım.",
  "44": "Verimli ofisler için ekipman ve sarf.",
  "45": "Baskıdan yayına görsel ve ses teknolojisi.",
  "46": "Tesis ve personel güvenliği için ekipman.",
  "47": "Hijyenik tesisler için temizlik ürünleri.",
  "48": "Mutfaktan salona profesyonel ekipman.",
  "49": "Spor ve rekreasyon için donanım.",
  "50": "Toptan gıda ve içecek tedariki.",
  "51": "Güvenli tedarik zinciriyle ilaç ürünleri.",
  "52": "Ev ve ofis için tüketici ürünleri.",
  "53": "Toplu alım için giyim ve kişisel bakım.",
  "54": "Değerli metal ve takı ürünleri.",
  "55": "Basılı ve dijital yayın ürünleri.",
  "56": "Çalışma alanları için mobilya ve döşeme.",
  "57": "Acil durum ve yardım malzemeleri.",
  "60": "Eğitim, müzik ve oyun gereçleri.",
  "64": "Kurumsal finans araçları.",
  "70": "Tarım ve balıkçılık için hizmet ortakları.",
  "71": "Saha operasyonları için uzman hizmet.",
  "72": "İnşaat ve bakımda güvenilir yükleniciler.",
  "73": "Daha güçlü üretim için doğru iş ortakları.",
  "76": "Tesis temizliği ve atık yönetimi hizmetleri.",
  "77": "Çevre uyumu ve sürdürülebilirlik hizmetleri.",
  "78": "Yükünüz için taşıma ve depolama çözümleri.",
  "80": "Yönetim ve danışmanlık hizmetleri.",
  "81": "Mühendislik ve teknoloji hizmetleri.",
  "82": "Tasarım, reklam ve medya hizmetleri.",
  "83": "Altyapı ve kamu hizmetleri.",
  "84": "Finans ve sigorta hizmetleri.",
  "85": "Sağlık ve bakım hizmetleri.",
  "86": "Eğitim ve öğretim hizmetleri.",
  "90": "Konaklama, yemek ve seyahat hizmetleri.",
  "91": "Kişisel ve ev içi hizmetler.",
  "92": "Güvenlik ve kamu düzeni hizmetleri.",
  "93": "Toplumsal ve yurttaşlık hizmetleri.",
  "94": "Dernek, kulüp ve organizasyon hizmetleri.",
  "95": "Arazi, bina ve altyapı yatırımları.",
};

const FALLBACK = "Doğrulanmış tedarikçilerden teklif alın.";

/** Kategori kodunun (herhangi seviye) segment sloganı. */
export function segmentTagline(code: string | undefined): string {
  if (!code || !/^\d{8}$/.test(code)) return FALLBACK;
  return TAGLINES[code.slice(0, 2)] ?? FALLBACK;
}

/** Kapsam testi için. */
export const TAGLINE_SEGMENTS = Object.keys(TAGLINES);
