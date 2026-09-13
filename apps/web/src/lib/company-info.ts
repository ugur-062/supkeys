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
  /**
   * Destek adresi İNGİLİZCE (2026-09-13, kullanıcı kararı): `support@`
   * uluslararası konvansiyon, yabancı firma kaydı da kabul ettiğimiz için
   * (sekiz ülke) Türkçe `destek@` yalnız bir kitleye hitap ediyordu.
   */
  supportEmail: "support@rothern.com",
  /**
   * KVKK adresi TÜRKÇE KALIR — bu bir dil tercihi değil, HUKUKİ KANAL adı.
   * 6698 sayılı kanun kapsamındaki başvuruyu yapan kişi ve denetimde Kurul,
   * tam olarak bu sözcüğü arar. `privacy@` istenirse Workspace'te takma ad
   * olarak eklenip aynı kutuya yönlendirilir; künyedeki adres bu kalmalı.
   */
  kvkkEmail: "kvkk@rothern.com",
  website: "www.rothern.com",
  /**
   * Yetki maddeleri bunu kullanır (sözleşmelerde "… yetkilidir").
   *
   * ⚠️ TAŞINMA SÜRÜYOR (2026-09-13, sahibin beyanı): yukarıdaki adres
   * teknopark adresi ve fiilen oraya taşınıldı, ancak TİCARET SİCİLİ /
   * MERSİS işlemleri HENÜZ TAMAMLANMADI. Vergi dairesinin Sarıgazi
   * (Anadolu yakası) kalması bunun kanıtı — vergi dairesi kayıtlı merkeze
   * göre atanır.
   *
   * Bu yüzden yetki maddesi kayıtlı merkeze göre Anadolu'da BIRAKILDI.
   * Tescil tamamlanınca ÜÇÜ BİRLİKTE gözden geçirilmeli:
   * `taxOffice` (Bakırköy tarafına geçer), bu alan
   * ("Bakırköy Mahkemeleri ve İcra Daireleri") ve varsa şube/merkez ayrımı.
   * Yalnız birini değiştirmek künyeyi kendi içinde çelişkili bırakır.
   */
  jurisdiction: "İstanbul Anadolu Mahkemeleri ve İcra Daireleri",
} as const;
