/**
 * KATEGORİ GÖRSELİ — üretilmiş görünüm (Faz 3a).
 *
 * Sorun: envanterimizin çoğu ALIM ve alıcı fotoğraf yüklemiyor (görsel
 * asimetrisi: satan gösterir, alan tarif eder). Görselsiz kartta gri kutu
 * göstermek sayfayı "yüklenememiş" gösteriyordu.
 *
 * Çözüm: her ilanın/ürünün kategorisi VAR. 8 haneli kodun ilk iki hanesi
 * segmenti verir (hiyerarşi koddan türer) → 58 segment için ikon + ton
 * eşlemesi yeter. Gerçek fotoğrafa ihtiyaç duymadan anlamlı, tutarlı ve
 * kategoriye ÖZGÜ bir görsel çıkar.
 *
 * `Category.imageUrl` doluysa o kazanır — bu tablo yalnız yedek.
 *
 * ── TON SEÇİMİ RASTGELE DEĞİL ─────────────────────────────────────────────
 * Marka monokrom (globals.css `@theme` mavi tonları bilinçle zinc'e map
 * ediyor), o yüzden ton ALAN AİLESİNİ anlatır ve çok düşük doygunlukta
 * kalır (`-50` zemin, ikon `/40` opaklıkta). Rastgele renk dağıtmak marka
 * dilini bozardı; anlamlı gruplama ise ızgarada okunabilirlik kazandırır:
 *
 *   amber   → hammadde ve doğal malzeme
 *   zinc    → makine ve ağır ekipman
 *   sky     → yapı, bileşen, altyapı
 *   emerald → bilim, sağlık, laboratuvar
 *   violet  → bilgi, ofis, medya
 *   rose    → tüketici ürünleri
 *   teal    → hizmetler
 */
import {
  Anchor,
  Banknote,
  Beaker,
  Bike,
  Book,
  Briefcase,
  Brush,
  Building2,
  Cable,
  Car,
  ChefHat,
  Cog,
  Cpu,
  Droplets,
  Factory,
  Flame,
  FlaskConical,
  Forklift,
  Fuel,
  Gavel,
  GraduationCap,
  HardHat,
  Hotel,
  Users as UsersIcon,
  Laptop,
  Leaf,
  Lightbulb,
  Landmark,
  LifeBuoy,
  Microscope,
  Music,
  Package,
  Paintbrush,
  Palette,
  PawPrint,
  Pickaxe,
  Pill,
  Plane,
  Printer,
  Recycle,
  Ruler,
  Scale,
  Scissors,
  Shield,
  ShoppingBag,
  Shirt,
  Sofa,
  Sparkles,
  Sprout,
  Stethoscope,
  Tractor,
  Trees,
  Truck,
  Users,
  Wheat,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";

export type CategoryTone =
  | "amber"
  | "zinc"
  | "sky"
  | "emerald"
  | "violet"
  | "rose"
  | "teal";

interface SegmentVisual {
  icon: LucideIcon;
  tone: CategoryTone;
}

/** 58 Ariba/UNSPSC segmenti — kod → ikon + ton. */
const SEGMENTS: Record<string, SegmentVisual> = {
  // ── Hammadde ve doğal malzeme ──
  "10": { icon: Sprout, tone: "amber" }, // Canlı bitkiler, hayvanlar
  "11": { icon: Pickaxe, tone: "amber" }, // Metaller, mineraller, tekstil
  "12": { icon: FlaskConical, tone: "amber" }, // Kimyasal maddeler
  "13": { icon: Droplets, tone: "amber" }, // Reçine, kauçuk, elastomer
  "14": { icon: Book, tone: "amber" }, // Kağıt ürünler
  "15": { icon: Fuel, tone: "amber" }, // Yakıt, katkı, kayganlaştırıcı

  // ── Makine ve ağır ekipman ──
  "20": { icon: Pickaxe, tone: "zinc" }, // Madencilik ve sondaj makineleri
  "21": { icon: Tractor, tone: "zinc" }, // Tarım ve balıkçılık makineleri
  "22": { icon: HardHat, tone: "zinc" }, // Ağır iş ekipmanı
  "23": { icon: Factory, tone: "zinc" }, // Endüstriyel üretim makineleri
  "24": { icon: Forklift, tone: "zinc" }, // Malzeme elleçleme ve depolama
  "25": { icon: Car, tone: "zinc" }, // Araçlar ve bileşenleri
  "26": { icon: Zap, tone: "zinc" }, // Güç üretim ve dağıtımı
  "27": { icon: Wrench, tone: "zinc" }, // Aletler ve genel makineler

  // ── Yapı, bileşen, altyapı ──
  "30": { icon: Building2, tone: "sky" }, // İnşaat malzemeleri
  "31": { icon: Cog, tone: "sky" }, // Üretim bileşenleri
  "32": { icon: Cpu, tone: "sky" }, // Elektronik bileşenler
  "39": { icon: Lightbulb, tone: "sky" }, // Elektrik sistemleri ve aydınlatma
  "40": { icon: Cable, tone: "sky" }, // Dağıtım ve koşullama sistemleri
  "95": { icon: Landmark, tone: "sky" }, // Arazi, bina, ulaşım altyapısı

  // ── Bilim ve sağlık ──
  "41": { icon: Microscope, tone: "emerald" }, // Laboratuvar ekipmanı
  "42": { icon: Stethoscope, tone: "emerald" }, // Tıp
  "51": { icon: Pill, tone: "emerald" }, // İlaç ürünleri
  "85": { icon: LifeBuoy, tone: "emerald" }, // Sağlık bakım hizmetleri

  // ── Bilgi, ofis, medya ──
  "43": { icon: Laptop, tone: "violet" }, // Bilgisayar, yazılım, telekom
  "44": { icon: Printer, tone: "violet" }, // Ofis ekipmanı
  "45": { icon: Palette, tone: "violet" }, // Baskı, fotoğraf, ses-video
  "46": { icon: Shield, tone: "violet" }, // Kolluk, güvenlik ekipmanı
  "55": { icon: Book, tone: "violet" }, // Yayınlanmış ürünler
  "60": { icon: Music, tone: "violet" }, // Eğitim gereçleri, müzik, oyuncak

  // ── Tüketici ürünleri ──
  "47": { icon: Brush, tone: "rose" }, // Temizlik malzemeleri
  "48": { icon: ChefHat, tone: "rose" }, // Hizmet sektörü ekipmanı
  "49": { icon: Bike, tone: "rose" }, // Spor malzemeleri
  "50": { icon: Wheat, tone: "rose" }, // Gıda ve içecek
  "52": { icon: Package, tone: "rose" }, // Tüketici elektroniği
  "53": { icon: Shirt, tone: "rose" }, // Giyim, çanta, kişisel bakım
  "54": { icon: Sparkles, tone: "rose" }, // Takılar
  "56": { icon: Sofa, tone: "rose" }, // Mobilya ve döşeme
  "57": { icon: LifeBuoy, tone: "rose" }, // İnsani yardım malzemeleri

  // ── Hizmetler ──
  "64": { icon: Banknote, tone: "teal" }, // Finansal araçlar
  "70": { icon: Leaf, tone: "teal" }, // Tarım ve balıkçılık hizmetleri
  "71": { icon: Flame, tone: "teal" }, // Maden, petrol, doğal gaz hizmetleri
  "72": { icon: HardHat, tone: "teal" }, // Bina inşaat ve bakım hizmetleri
  "73": { icon: Factory, tone: "teal" }, // Endüstriyel üretim hizmetleri
  "76": { icon: Scissors, tone: "teal" }, // Endüstriyel temizlik hizmetleri
  "77": { icon: Recycle, tone: "teal" }, // Çevre hizmetleri
  "78": { icon: Truck, tone: "teal" }, // Taşıma, depolama, posta
  "80": { icon: Briefcase, tone: "teal" }, // Profesyonel ve idari hizmetler
  "81": { icon: Ruler, tone: "teal" }, // Teknoloji ve mühendislik hizmetleri
  "82": { icon: Paintbrush, tone: "teal" }, // Kreatif hizmetler
  "83": { icon: Landmark, tone: "teal" }, // Kamu sektörü hizmetleri
  "84": { icon: Scale, tone: "teal" }, // Finans ve sigorta hizmetleri
  "86": { icon: GraduationCap, tone: "teal" }, // Eğitim ve öğretim hizmetleri
  "90": { icon: Hotel, tone: "teal" }, // Konaklama hizmetleri
  "91": { icon: UsersIcon, tone: "teal" }, // Kişisel ve ev içi hizmetler
  "92": { icon: Gavel, tone: "teal" }, // Kamu düzeni ve güvenlik hizmetleri
  "93": { icon: Users, tone: "teal" }, // Siyasi ve yurttaşlık hizmetleri
  "94": { icon: Users, tone: "teal" }, // Organizasyonlar ve kulüpler
};

/** Hiçbir kategori kodu yoksa/tanınmıyorsa — nötr ama gri kutu değil. */
const FALLBACK: SegmentVisual = { icon: Package, tone: "zinc" };

/**
 * Kategori kodlarından görünüm seçer.
 *
 * En SPESİFİK koda değil, ilk kodun SEGMENTİNE bakar: bir ilan birden çok
 * kategori taşıyabilir ama görseli tek; ilk kod sahibin birincil seçimidir.
 */
export function categoryVisual(codes: string[] | undefined): SegmentVisual {
  const first = (codes ?? []).find((c) => /^\d{8}$/.test(c));
  if (!first) return FALLBACK;
  return SEGMENTS[first.slice(0, 2)] ?? FALLBACK;
}

/**
 * Ton → sınıf eşlemesi. Tailwind sınıf adları ÇALIŞMA ZAMANINDA
 * birleştirilemez (JIT tarayıcı kaynak metni okur), o yüzden tam sınıf
 * adları burada YAZILI durur.
 */
export const TONE_CLASS: Record<
  CategoryTone,
  { surface: string; icon: string }
> = {
  amber: { surface: "bg-amber-50", icon: "text-amber-600/40" },
  zinc: { surface: "bg-zinc-100", icon: "text-zinc-500/40" },
  sky: { surface: "bg-sky-50", icon: "text-sky-600/40" },
  emerald: { surface: "bg-emerald-50", icon: "text-emerald-600/40" },
  violet: { surface: "bg-violet-50", icon: "text-violet-600/40" },
  rose: { surface: "bg-rose-50", icon: "text-rose-600/40" },
  teal: { surface: "bg-teal-50", icon: "text-teal-600/40" },
};

/** Tüm segment kodları — kapsam testi bunu kullanır. */
export const MAPPED_SEGMENTS = Object.keys(SEGMENTS);
