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
  photos?: string[] | null;
  foundedYear?: number | string | null;
  employeeCount?: string | null;
  website?: string | null;
  industry?: string | null;
  city?: string | null;
  buyerCategoryIds?: string[] | null;
  sellerCategoryIds?: string[] | null;
}

export interface ProfileCompleteness {
  pct: number;
  /** Eksik alan etiketleri — kullanıcıya gösterilen sırayla. */
  missing: string[];
}

const filled = (v: string | number | null | undefined): boolean =>
  v != null && String(v).trim() !== "";

export function profileCompleteness(p: ProfileCompletenessInput): ProfileCompleteness {
  const items: [string, boolean][] = [
    ["Logo", filled(p.logoUrl)],
    ["Kapak", filled(p.coverImageUrl)],
    ["Hakkında", filled(p.aboutText)],
    ["Hizmetler", (p.services?.length ?? 0) > 0],
    ["Fotoğraflar", (p.photos?.length ?? 0) > 0],
    ["Kuruluş yılı", filled(p.foundedYear)],
    ["Çalışan sayısı", filled(p.employeeCount)],
    ["Web sitesi", filled(p.website)],
    ["Sektör", filled(p.industry)],
    ["Şehir", filled(p.city)],
    [
      "Faaliyet kategorileri",
      (p.buyerCategoryIds?.length ?? 0) + (p.sellerCategoryIds?.length ?? 0) > 0,
    ],
  ];
  const done = items.filter(([, ok]) => ok).length;
  return {
    pct: Math.round((done / items.length) * 100),
    missing: items.filter(([, ok]) => !ok).map(([l]) => l),
  };
}
