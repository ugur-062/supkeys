/**
 * ÇALIŞAN SAYISI KOVALARI — süzgeç ekseni (2026-09-07).
 *
 * `Company.employeeCount` bir **serbest metin** kolonu ("50-100", "250-500",
 * "10-50"). Kolonu enum'a çevirmek migration ister; kullanıcı kararı
 * migration'sız ilerlemek oldu, bu yüzden kova mantığı burada yaşıyor:
 *
 *  · YENİ kayıtlar profil formundaki kovalı `<select>`ten gelir (aşağıdaki
 *    `EMPLOYEE_BUCKETS` etiketleri birebir yazılır) → ayrıştırma gerekmez;
 *  · ESKİ kayıtlar ("50-100") metinden ayrıştırılır.
 *
 * AYRIŞTIRMA ALT SINIRA GÖRE, ve bu bilinçli bir YAKLAŞIKLIK: "10-50" iki
 * kovaya yayılır ("10-49" ve "50-249"), biz alt sınırı sayarız. Serbest
 * metinde daha iyisi mümkün değil — bir firmanın 10 mu 50 mi çalışanı
 * olduğunu metin söylemiyor. Formun kovaya çevrilmesinin sebebi tam da bu:
 * yeni veri geldikçe tahmin payı kendiliğinden kaybolur.
 *
 * Ayrıştırılamayan metin (`null`) hiçbir kovaya girmez — uydurulmuş bir
 * kovaya atmaktansa süzgeç dışında bırakmak dürüst.
 */

/** Kova anahtarı = ALT SINIR (URL'de sayı: `calisan=10,50`). */
export const EMPLOYEE_BUCKETS = [
  { key: 1, label: "1-9" },
  { key: 10, label: "10-49" },
  { key: 50, label: "50-249" },
  { key: 250, label: "250+" },
] as const;

export type EmployeeBucketKey = (typeof EMPLOYEE_BUCKETS)[number]["key"];

export const EMPLOYEE_BUCKET_KEYS = EMPLOYEE_BUCKETS.map((b) => b.key) as readonly number[];

/** Profil formundaki `<select>` seçenekleri — kolona bu etiketler yazılır. */
export const EMPLOYEE_BUCKET_LABELS = EMPLOYEE_BUCKETS.map((b) => b.label) as readonly string[];

export function isEmployeeBucketKey(n: number): n is EmployeeBucketKey {
  return EMPLOYEE_BUCKET_KEYS.includes(n);
}

/** Alt sınır → etiket ("50" → "50-249"). */
export function employeeBucketLabel(key: number): string {
  return EMPLOYEE_BUCKETS.find((b) => b.key === key)?.label ?? String(key);
}

/**
 * Serbest metin → kova alt sınırı. Metindeki İLK tam sayıyı okur:
 * "50-100" → 50 → 50; "250-500" → 250 → 250; "yaklaşık 8 kişi" → 8 → 1.
 * Sayı yoksa `null`.
 */
export function employeeBucket(raw?: string | null): EmployeeBucketKey | null {
  if (!raw) return null;
  const m = /\d+/.exec(raw.replace(/[.\s]/g, ""));
  if (!m) return null;
  const n = Number(m[0]);
  if (!Number.isFinite(n) || n < 1) return null;
  if (n >= 250) return 250;
  if (n >= 50) return 50;
  if (n >= 10) return 10;
  return 1;
}
