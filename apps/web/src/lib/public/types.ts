export interface PublicSupplierReview {
  id: string;
  rating: number;
  reviewText: string | null;
  /** B2B normu — değerlendiren alıcı firma adı (Tenant.name). */
  reviewerName: string;
  createdAt: string;
}

/**
 * Public tedarikçi profil tipi — API'den döner.
 * Backend: PublicSupplierProfileResponse ile birebir aynı şekil.
 */
export interface PublicSupplierProfile {
  slug: string;
  companyName: string;
  companyType: string;
  industry: string | null;
  city: string;
  district: string;
  website: string | null;
  linkedinUrl: string | null;
  instagramUrl: string | null;
  coverImageUrl: string | null;
  /** V2-PUBLIC-PROFILE — Logo (profil resmi). Hero avatar yerine. */
  logoImageUrl: string | null;
  aboutText: string | null;
  services: string[];
  categories: { id: string; nameTr: string }[];
  photos: { id: string; url: string; caption: string | null }[];
  /** ISO date — "X yıldır Supkeys üyesi" hesabı için. */
  memberSinceIso: string;
  /** V2-PUBLIC-PROFILE-DETAILS — Detaylı alanlar. */
  foundedYear: number | null;
  employeeCount: string | null;
  certifications: string[];
  /** V2-TRUST — Tescil. Şahıs işletmesinde tax/mersis hep null (KVKK). */
  taxNumber: string | null;
  taxOffice: string | null;
  mersisNo: string | null;
  /** En az bir trust signal public iken true → "Doğrulanmış İşletme" rozeti. */
  verifiedBusiness: boolean;
  /** V2-REVIEWS — Toplam yıldız istatistikleri. */
  rating: {
    average: number | null;
    count: number;
    /** 1-5 yıldız bazında kaç değerlendirme var ("1"-"5" anahtarları). */
    distribution: Record<string, number>;
  };
  /** V2-REVIEWS — Son 10 herkese açık yorum (en yeni → en eski). */
  reviews: PublicSupplierReview[];
}
