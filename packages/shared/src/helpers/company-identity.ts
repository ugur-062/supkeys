/**
 * Madde 29 — Firma kimlik/doğrulama alanları için ortak validasyon yardımcıları.
 *
 * Backend (class-validator custom / servis) ve frontend (zod refine) aynı
 * mantığı paylaşsın diye saf fonksiyonlar. Hepsi `boolean` döner; mesajlar
 * çağıran tarafta üretilir ("Bu değer geçersiz." / "Bu önemli firma bilgisini
 * doldurun.").
 */

/** Sadece rakam içeren n-haneli kontrolü. */
function isDigits(value: string, length: number): boolean {
  return new RegExp(`^[0-9]{${length}}$`).test(value);
}

/** VKN — Vergi Kimlik No: tüzel kişi, 10 hane rakam. */
export function isValidVkn(value: string): boolean {
  return isDigits(value.trim(), 10);
}

/**
 * TCKN — T.C. Kimlik No: 11 hane + standart kontrol algoritması.
 * - İlk hane 0 olamaz.
 * - 10. hane = ((1,3,5,7,9. hanelerin toplamı)×7 − (2,4,6,8. toplamı)) mod 10.
 * - 11. hane = (ilk 10 hanenin toplamı) mod 10.
 */
export function isValidTckn(value: string): boolean {
  const v = value.trim();
  if (!isDigits(v, 11)) return false;
  const d = v.split("").map(Number);
  if (d[0] === 0) return false;
  const oddSum = d[0] + d[2] + d[4] + d[6] + d[8];
  const evenSum = d[1] + d[3] + d[5] + d[7];
  const tenth = (oddSum * 7 - evenSum) % 10;
  if (((tenth + 10) % 10) !== d[9]) return false;
  const sumFirstTen = d.slice(0, 10).reduce((s, n) => s + n, 0);
  return sumFirstTen % 10 === d[10];
}

/**
 * Vergi Kimlik No / TC — firma türüne göre.
 * - SOLE_PROPRIETOR (şahıs) → 11 hane TCKN.
 * - Tüzel (A.Ş./Ltd.) → 10 hane VKN.
 */
export function isValidTaxId(
  value: string,
  isSoleProprietor: boolean,
): boolean {
  return isSoleProprietor ? isValidTckn(value) : isValidVkn(value);
}

/**
 * Yabancı (TR dışı) firma vergi/sicil no — gevşek format. Her ülkenin VAT/EIN/
 * şirket numarası farklı olduğu için checksum yapılmaz; sadece makul biçim:
 * 3-30 karakter, alfanümerik + yaygın ayraçlar. Asıl doğrulama belge + admin
 * onayı (+ ileride VIES gibi resmi servisler) ile yapılır.
 */
export function isValidForeignTaxId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9.\- /]{2,29}$/.test(value.trim());
}

/**
 * Ülke-farkında vergi/sicil no doğrulaması.
 * - TR → strict VKN(10)/TCKN(11) (firma türüne göre).
 * - Diğer → gevşek yabancı format.
 */
export function isValidTaxIdForCountry(
  value: string,
  country: string,
  isSoleProprietor: boolean,
): boolean {
  if ((country || "TR") === "TR") return isValidTaxId(value, isSoleProprietor);
  return isValidForeignTaxId(value);
}

/** MERSİS — boş VEYA tam 16 hane. */
export function isValidMersis(value: string | null | undefined): boolean {
  const v = (value ?? "").trim();
  if (v === "") return true;
  return isDigits(v, 16);
}

/** Boşlukları temizleyip büyük harfe çevirir (IBAN normalizasyonu). */
export function normalizeIban(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

/**
 * IBAN — Türkiye: "TR" + 24 rakam = 26 karakter + ISO 13616 mod-97 kontrolü.
 */
export function isValidIbanTr(value: string): boolean {
  const v = normalizeIban(value);
  if (!/^TR[0-9]{24}$/.test(v)) return false;
  return ibanChecksumOk(v);
}

/**
 * ISO 13616 mod-97 sağlaması — ülke bağımsız (denetim Dalga B, P3).
 *
 * Eskiden mod-97 YALNIZ `isValidIbanTr` içinde, TR uzunluk kontrolüne
 * gömülüydü; yabancı IBAN'lar sadece `^[A-Z]{2}[0-9A-Z]{8,32}$` şekil
 * kontrolünden geçiyordu. Yani tek hane yanlış yazılmış bir DE/NL IBAN'ı
 * kabul ediliyor, siparişte ödeme hesabı olarak damgalanıyor ve para yanlış
 * hesaba gönderilmeye çalışılıyordu — hata ancak bankada ortaya çıkar.
 * 98 ülke destekleniyor (COUNTRIES), bu yüzden yabancı IBAN istisna değil.
 *
 * Uzunluk ülkeye göre değişir (15-34) ve tam tablo burada tutulmuyor; mod-97
 * zaten tek/çift hane hatalarını ve yer değiştirmeleri yakalar.
 */
export function ibanChecksumOk(value: string): boolean {
  const v = normalizeIban(value);
  if (!/^[A-Z]{2}[0-9]{2}[0-9A-Z]{11,30}$/.test(v)) return false;
  // mod-97: ilk 4 karakteri sona taşı, harfleri sayıya çevir (A=10..Z=35), %97==1
  const rearranged = v.slice(4) + v.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (c) =>
    String(c.charCodeAt(0) - 55),
  );
  let remainder = 0;
  for (const ch of numeric) {
    remainder = (remainder * 10 + (ch.charCodeAt(0) - 48)) % 97;
  }
  return remainder === 1;
}

/**
 * IBAN maskesi — TEK KAYNAK: ülke kodu (ilk 2) + son 4 karakter açık, arası
 * yıldız; boşluksuz kompakt döner (gruplama görüntü katmanının işi).
 * Örn. TR330006100519786457841326 → "TR********************1326".
 * Ham IBAN'ı yetkisiz kullanıcıya veya audit metadata'sına yazmak YASAK —
 * o yüzeylerde her zaman bu helper kullanılır (üçüncü tanım yazma).
 */
export function maskIban(value: string): string {
  const v = normalizeIban(value);
  if (v.length < 8) return "*".repeat(v.length);
  return v.slice(0, 2) + "*".repeat(v.length - 6) + v.slice(-4);
}

/** KEP / e-posta — basit e-posta format kontrolü. */
export function isValidEmailLike(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** Faaliyet sektörü seçimi — min 1, max 3 (ilk = ana sektör). */
export const SECTOR_MIN = 1;
export const SECTOR_MAX = 3;
export function isValidSectorSelection(ids: string[]): boolean {
  const unique = new Set(ids);
  return (
    ids.length >= SECTOR_MIN &&
    ids.length <= SECTOR_MAX &&
    unique.size === ids.length
  );
}
