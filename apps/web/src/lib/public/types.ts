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
  aboutText: string | null;
  services: string[];
  categories: { id: string; nameTr: string }[];
  photos: { id: string; url: string; caption: string | null }[];
  /** ISO date — "X yıldır Supkeys üyesi" hesabı için. */
  memberSinceIso: string;
}
