/**
 * Platform işletmecisi bilgileri — TEK KAYNAK. Künye, sözleşmeler ve
 * mesafeli satış metinleri buradan okur; asıl şirkete geçişte (işletme
 * devri, Kullanıcı Sözleşmesi m.11) yalnız bu dosya güncellenir.
 *
 * JSON-LD `organizationNode()` de buradan okur — künyedeki adresle yapısal
 * verideki adres BİREBİR aynı olmalı, yoksa Google iki farklı işletme
 * kaydı görür. Adres eskiden `lib/seo/jsonld.ts` içinde ikinci kez elle
 * yazılıydı; `addressParts` o kopyayı kapattı.
 */
export const OPERATOR = {
  /** Ticari unvan */
  legalName: "Rothern Teknoloji Limited Şirketi",
  /** Marka */
  brand: "Rothern",
  address:
    "Yeşilköy Mah. Havaalanı Cad. Dış Hatlar Sitesi Terminal İstanbul Şube No: 2/5 İç Kapı No: 20, Bakırköy / İstanbul",
  /** JSON-LD PostalAddress için ayrıştırılmış hâli — `address` ile aynı olgu. */
  addressParts: {
    street:
      "Yeşilköy Mah. Havaalanı Cad. Dış Hatlar Sitesi Terminal İstanbul Şube No: 2/5 İç Kapı No: 20",
    district: "Bakırköy",
    city: "İstanbul",
    country: "TR",
  },
  taxOffice: "Sarıgazi Vergi Dairesi",
  taxNo: "7352364681",
  /**
   * MERSİS numarası — 6563 sayılı Elektronik Ticaret Kanunu ve ilgili
   * yönetmelik künyede ZORUNLU tutuyor. 16 hane; vergi numarasını içinde
   * taşır (`0` + vergi no + sıra), ikisi ayrışırsa biri yanlış girilmiştir.
   */
  mersisNo: "0735236468100001",
  supportEmail: "destek@rothern.com",
  kvkkEmail: "kvkk@rothern.com",
  website: "www.rothern.com",
  /**
   * Yetki maddeleri bunu kullanır (sözleşmelerde "… yetkilidir").
   *
   * AÇIK SORU: künyedeki adres Bakırköy (Avrupa yakası) ama vergi dairesi
   * Sarıgazi (Anadolu yakası) — vergi dairesi KAYITLI MERKEZE göre atandığı
   * için merkez büyük olasılıkla hâlâ Anadolu yakasında ve Bakırköy adresi
   * şube/yazışma adresi. Tahminle değiştirmek sözleşme şartını bozar, o
   * yüzden mevcut değer korundu. Merkez gerçekten Bakırköy'e taşındıysa
   * burası "Bakırköy Mahkemeleri ve İcra Daireleri" olmalı.
   */
  jurisdiction: "İstanbul Anadolu Mahkemeleri ve İcra Daireleri",
} as const;
