import { PRODUCT_LIMITS } from "@rothern/shared";
import type { CompanyTier } from "@/lib/company-auth/types";

/**
 * PAKET KATALOĞU — TEK KAYNAK (2026-09-15).
 *
 * Önceden yalnız pazarlama sayfasının (`nasil-calisir/marketing-page.tsx`)
 * içinde yaşıyordu. Panel içi paket sayfası (`/company/premium`) ve satın alma
 * ekranı da aynı adı, fiyatı ve özellik listesini göstermek zorunda: iki kopya
 * olsaydı biri güncellenip diğeri eski fiyatı basardı.
 *
 * Yetenekler `@rothern/shared` `helpers/tier.ts` ile hizalı: STANDART = davetli/
 * bağlantılı taleplere teklif (2 koltuk); SILVER = satış paketi (4 koltuk);
 * GOLD = iki panel (6 koltuk).
 *
 * FİYAT: USD, KDV hariç, YILLIK ödemede aylık karşılık. 6 aylık dönemin aylık
 * tutarı farklı ve henüz açıklanmadı — bu yüzden burada YOK; satın alma ekranı
 * yalnız yıllık dönemi hesaplar. (Fiyatların kendisi kullanıcı kararı bekliyor;
 * değişirse yalnız bu dosya değişir.)
 */
export interface PricingPlan {
  tier: CompanyTier;
  name: string;
  /** Yıllık ödemede aylık USD; ücretsiz pakette null. */
  monthlyUsd: number | null;
  tagline: string;
  features: readonly string[];
  /** Pazarlama sayfasındaki kayıt çağrısı. */
  cta: string;
  /** URL parçası: `/company/premium/satin-al?paket=<slug>`. */
  slug: "standart" | "silver" | "gold";
}

export const PRICING_PLANS: readonly PricingPlan[] = [
  {
    tier: "STANDART",
    slug: "standart",
    name: "Standart",
    monthlyUsd: null,
    tagline: "Vitrinini aç, çevren içinde al-sat.",
    features: [
      `Herkese açık firma profili ve ${PRODUCT_LIMITS.STANDART} ürünlük vitrin — firma dizininde yer`,
      "Davet edildiğiniz ve bağlantılı firmaların taleplerine teklif verme",
      "Gelen bağlantı davetlerini kabul etme, mesajlaşma",
      "Sipariş, teslim & ödeme adımı takibi",
      "2 koltuk",
    ],
    cta: "Ücretsiz Başla",
  },
  {
    tier: "SILVER",
    slug: "silver",
    name: "Silver",
    monthlyUsd: 160,
    tagline: "Tedarikçi paketi: görün, davet al, teklif ver, ürünlerini sergile.",
    features: [
      "“Doğrulanmış” rozeti ve dizinde öncelikli sıra",
      "Sınırsız ürün, ürün belgesi (PDF) ve video",
      "Herkese açık satın alma taleplerine sınırsız teklif",
      "Bağlantı daveti gönderme ve bilgi taleplerinde alıcı kimliği",
      "Ziyaret Edenler ve İş Analizi",
      "Yapay zekâ: belgeden fiyatlama, AI ile talep arama",
      "4 satış koltuğu",
    ],
    cta: "Silver'a Başla",
  },
  {
    tier: "GOLD",
    slug: "gold",
    name: "Gold",
    monthlyUsd: 230,
    tagline: "İki panel birden: alış & satışı tek hesapta yönet.",
    features: [
      "Silver'ın tamamı",
      "Satın Alma Talebi açma — teklif toplama (RFQ) & pazarlık/eksiltme",
      "Kazandırma, onay akışları, raporlar & şablonlar",
      "Yapay zekâ — belgeden talep taslağı, sohbet asistanı, tedarikçi keşfi",
      "“Gold Üye” rozeti — profil ve tekliflerde güven işareti",
      "6 koltuk (satınalma ve satış)",
    ],
    cta: "Gold'a Başla",
  },
];

export const PRICING_NOTE =
  "Fiyatlar USD cinsindendir ve KDV hariçtir. Ödeme 6 aylık veya yıllık dönem için peşin alınır; aylık faturalama yoktur. 6 aylık dönemde aylık tutar farklıdır.";

export function planBySlug(slug: string | null | undefined): PricingPlan | null {
  return PRICING_PLANS.find((p) => p.slug === slug?.toLowerCase()) ?? null;
}

export function planByTier(tier: CompanyTier): PricingPlan {
  return PRICING_PLANS.find((p) => p.tier === tier) ?? PRICING_PLANS[0]!;
}

/** "$1.920" — Türkçe binlik ayraç, USD. */
export function formatUsd(amount: number): string {
  return `$${amount.toLocaleString("tr-TR")}`;
}
