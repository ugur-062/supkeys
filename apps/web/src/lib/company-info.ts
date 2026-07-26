/**
 * Platform işletmecisi bilgileri — TEK KAYNAK. Künye, sözleşmeler ve
 * mesafeli satış metinleri buradan okur; asıl şirkete geçişte (işletme
 * devri, Kullanıcı Sözleşmesi m.11) yalnız bu dosya güncellenir.
 */
export const OPERATOR = {
  /** Ticari unvan */
  legalName: "Sapphire Group Dış Ticaret Limited Şirketi",
  /** Marka */
  brand: "Rothern",
  address: "Dudullu OSB Mah. 1. Cad. No: 28/3, Ümraniye / İstanbul",
  taxOffice: "Sarıgazi Vergi Dairesi",
  taxNo: "744 123 1801",
  supportEmail: "destek@rothern.com",
  kvkkEmail: "kvkk@rothern.com",
  website: "www.rothern.com",
  /** Merkez Anadolu yakasında — yetki maddeleri bunu kullanır. */
  jurisdiction: "İstanbul Anadolu Mahkemeleri ve İcra Daireleri",
} as const;
