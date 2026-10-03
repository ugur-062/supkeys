/**
 * PROFİL TAMAMLANMA — TEK KAYNAK.
 *
 * Profilim sayfasındaki "%N tamam · Eksik: …" bloğu ile satış panosundaki
 * "Profil sağlığı" kartı AYNI hesabı okur. İki yerde iki hesap olsaydı pano
 * "%40" derken profil "%55" derdi ve kullanıcı hangisine inanacağını
 * bilemezdi (denetimde en sık tekrar eden hata: helper yazılır, çağrı
 * yerlerinin bir kısmı bağlanmaz).
 *
 * 2026-09-04: `@rothern/shared`a taşındı — herkese açık firma dizini de
 * aynı hesabı okur (listelenme koşulu: ≥1 yayında ürün VEYA tamlık ≥ %60).
 * API'de ikinci bir hesap yazılsaydı dizin "%55" derken Profilim "%64" derdi.
 *
 * Girdi bilinçli olarak GEVŞEK: Profilim taslağı alanları dize olarak tutar
 * ("" = boş), API profili null/number kullanır. İkisi de olduğu gibi verilir;
 * doluluk kararı burada tek yerde.
 */
export interface ProfileCompletenessInput {
  logoUrl?: string | null;
  coverImageUrl?: string | null;
  aboutText?: string | null;
  services?: string[] | null;
  foundedYear?: number | string | null;
  employeeCount?: string | null;
  website?: string | null;
  industry?: string | null;
  city?: string | null;
  buyerCategoryIds?: string[] | null;
  sellerCategoryIds?: string[] | null;
}

/**
 * Madde KODU (i18n Faz 3): paylaşılan paket metin değil kod taşır; metni
 * tüketici çevirir (web `web.domain.profileItem.<kod>`). Türkçe ad geriye
 * dönük olarak burada kalır — `missing` dizisi birebir aynı çıkar.
 */
export type ProfileCompletenessKey =
  | "logo"
  | "cover"
  | "about"
  | "services"
  | "foundedYear"
  | "employeeCount"
  | "website"
  | "industry"
  | "city"
  | "categories";

export interface ProfileCompletenessItem {
  key: ProfileCompletenessKey;
  /** Türkçe ad (katalog yoksa yedek). */
  label: string;
  done: boolean;
}

export interface ProfileCompleteness {
  pct: number;
  /** Eksik alan etiketleri (Türkçe) — kullanıcıya gösterilen sırayla. */
  missing: string[];
  /** Eksik alan KODLARI — `missing` ile aynı sırada; katalogdan çevrilir. */
  missingKeys: ProfileCompletenessKey[];
  /** Tüm maddeler (kod + Türkçe ad + doluluk) — sıra korunur. */
  items: ProfileCompletenessItem[];
}

const filled = (v: string | number | null | undefined): boolean =>
  v != null && String(v).trim() !== "";

export function profileCompleteness(p: ProfileCompletenessInput): ProfileCompleteness {
  const items: ProfileCompletenessItem[] = [
    { key: "logo", label: "Logo", done: filled(p.logoUrl) },
    { key: "cover", label: "Kapak", done: filled(p.coverImageUrl) },
    { key: "about", label: "Hakkında", done: filled(p.aboutText) },
    { key: "services", label: "Hizmetler", done: (p.services?.length ?? 0) > 0 },
    { key: "foundedYear", label: "Kuruluş yılı", done: filled(p.foundedYear) },
    { key: "employeeCount", label: "Çalışan sayısı", done: filled(p.employeeCount) },
    { key: "website", label: "Web sitesi", done: filled(p.website) },
    { key: "industry", label: "Sektör", done: filled(p.industry) },
    { key: "city", label: "Şehir", done: filled(p.city) },
    {
      key: "categories",
      label: "Faaliyet kategorileri",
      done: (p.buyerCategoryIds?.length ?? 0) + (p.sellerCategoryIds?.length ?? 0) > 0,
    },
  ];
  const done = items.filter((i) => i.done).length;
  const missingItems = items.filter((i) => !i.done);
  return {
    pct: Math.round((done / items.length) * 100),
    missing: missingItems.map((i) => i.label),
    missingKeys: missingItems.map((i) => i.key),
    items,
  };
}
