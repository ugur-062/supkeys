/**
 * Tedarikçi faaliyet sektörleri — kürasyonlu, tüm alanları kapsayan ~24'lük
 * liste. Onboarding (chip seçimi, 1-3 ilk=ana), tedarikçi havuzu filtresi ve
 * backend doğrulaması bu tek kaynağı paylaşır. UNSPSC'den bağımsız (string).
 */
export const SUPPLIER_SECTORS = [
  "Elektrik & Elektronik",
  "Bilişim & Yazılım",
  "Makine & Ekipman",
  "İnşaat & Yapı Malzemeleri",
  "Metal & Metalürji",
  "Kimya & Petrokimya",
  "Tekstil & Hazır Giyim",
  "Gıda & İçecek",
  "Tarım & Hayvancılık",
  "Otomotiv & Yan Sanayi",
  "Mobilya & Dekorasyon",
  "Ambalaj & Kağıt",
  "Plastik & Kauçuk",
  "Lojistik & Taşımacılık",
  "Sağlık & Medikal",
  "Kozmetik & Kişisel Bakım",
  "Temizlik & Hijyen",
  "Enerji & Yenilenebilir Enerji",
  "Ofis & Kırtasiye",
  "Hırdavat & Nalbur",
  "Güvenlik Sistemleri",
  "Reklam & Matbaa",
  "Madencilik & Maden Ürünleri",
  "Danışmanlık & Hizmetler",
] as const;

export type SupplierSector = (typeof SUPPLIER_SECTORS)[number];

export function isValidSupplierSector(value: string): boolean {
  return (SUPPLIER_SECTORS as readonly string[]).includes(value);
}
