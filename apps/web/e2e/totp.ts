import { createHmac } from "node:crypto";

/**
 * RFC 6238 TOTP (HMAC-SHA1, 6 hane, 30 sn) — API'nin `otplib` `authenticator`
 * varsayılanlarıyla aynı. E2E admin girişi için (admin 2FA, MU-01): gizli
 * değer `E2E_ADMIN_TOTP_SECRET` (authenticator kurulumundaki base32 anahtar).
 * Yeni bağımlılık eklememek için (CLAUDE.md) `otplib` yerine node:crypto.
 */
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/[\s=-]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32.indexOf(ch);
    if (idx === -1) throw new Error(`totp: geçersiz base32 karakteri "${ch}"`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** HOTP (RFC 4226) — ham anahtar + sayaç. */
export function hotp(key: Buffer, counter: number, digits = 6): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", key).update(msg).digest();
  const off = h[h.length - 1]! & 0x0f;
  const bin =
    ((h[off]! & 0x7f) << 24) | ((h[off + 1]! & 0xff) << 16) | ((h[off + 2]! & 0xff) << 8) | (h[off + 3]! & 0xff);
  return String(bin % 10 ** digits).padStart(digits, "0");
}

/** Base32 gizli değerden şu anki TOTP kodu. */
export function totp(secretBase32: string, nowMs = Date.now(), stepSec = 30, digits = 6): string {
  return hotp(base32Decode(secretBase32), Math.floor(nowMs / 1000 / stepSec), digits);
}

/**
 * Pencere sonuna az kaldıysa yeni pencereyi bekle: kod gönderilirken
 * geçerliliğini yitirmesin (otplib varsayılan `window` 0 — tolerans yok).
 */
export async function freshTotp(secretBase32: string, marginSec = 3): Promise<string> {
  const left = 30 - (Math.floor(Date.now() / 1000) % 30);
  if (left <= marginSec) await new Promise((r) => setTimeout(r, (left + 1) * 1000));
  return totp(secretBase32);
}
