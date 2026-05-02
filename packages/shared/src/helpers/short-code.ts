/**
 * Crockford Base32 alfabesi: 0-9 + A-Z, ancak I/L/O/U dışlanmış.
 * - I/L → 1 ile karışır
 * - O   → 0 ile karışır
 * - U   → V/profanity ile karışmasın diye dışlanır
 *
 * 32 karakter × 8 pozisyon ≈ 1.1 trilyon kombinasyon.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * Hem Node.js (>=19) hem browser tarafında çalışan Web Crypto üzerinden
 * uniform rastgele integer üretir. Modulo bias'ı önlemek için mask+retry.
 */
interface CryptoLike {
  getRandomValues<T extends Uint32Array>(array: T): T;
}

function randomIntCrypto(max: number): number {
  const range = 0x100000000; // 2^32
  const bucket = range - (range % max);
  const buf = new Uint32Array(1);
  const c = (globalThis as { crypto?: CryptoLike }).crypto;
  if (!c || typeof c.getRandomValues !== "function") {
    throw new Error("Web Crypto API kullanılamıyor (getRandomValues yok)");
  }
  // Çok küçük olasılıkla retry gerekir; pratikte ilk denemede biter.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    c.getRandomValues(buf);
    const value = buf[0]!;
    if (value < bucket) {
      return value % max;
    }
  }
}

/**
 * `K7X9-3M2P` formatında 8 karakterlik kısa davet kodu üretir.
 * Web Crypto API tabanlı (Node + browser) — entropy garantili.
 */
export function generateShortCode(): string {
  const part = (length: number): string => {
    let out = "";
    for (let i = 0; i < length; i++) {
      out += ALPHABET[randomIntCrypto(ALPHABET.length)];
    }
    return out;
  };
  return `${part(4)}-${part(4)}`;
}

/**
 * Kullanıcı kodu yapıştırırken sıkça yaptığı hataları normalize eder:
 * - lowercase → UPPERCASE
 * - boşluk veya `_` → `-`
 * - çoklu `-` → tek `-`
 * - ambigous karakterler (I/L/O/U) Crockford rule'una göre map edilmez —
 *   kullanıcının yanlış yazma ihtimali zaten format kontrolünde yakalanır.
 */
export function normalizeShortCode(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/[\s_]/g, "-")
    .replace(/-+/g, "-");
}

const SHORT_CODE_REGEX = /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

/**
 * `K7X9-3M2P` formatına uyup uymadığını kontrol eder. I/L/O/U dahil değil.
 */
export function validateShortCode(code: string): boolean {
  return SHORT_CODE_REGEX.test(code);
}

export const SHORT_CODE_PATTERN = SHORT_CODE_REGEX;
