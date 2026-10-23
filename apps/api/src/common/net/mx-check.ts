import { promises as dns } from "node:dns";

/**
 * E-POSTA ALAN ADI POSTA ALIYOR MU? — MX kaydı denetimi (2026-09-27, Faz 1).
 *
 * AI'ın web'de bulduğu adreslerin bir kısmı eski/yanlış alan adındadır; posta
 * almayan adrese davet göndermek kalıcı geri dönme (hard bounce) üretir ve
 * gönderen itibarını düşürür. Yeni bağımlılık yok: Node `dns`.
 *
 * Kural: MX yoksa A/AAAA'ya bakılır (RFC 5321 "örtük MX"); alan adı yok
 * (ENOTFOUND) ya da kayıt yok (ENODATA) → `false`. Geçici DNS hatası/zaman
 * aşımı → `true` (fail-open: geçici arıza gerçek bir tedarikçiyi listeden
 * düşürmesin; geri dönme olursa gönderim hattı zaten bastırır).
 * Sonuç süreç içinde 1 gün önbelleklenir.
 */
const TTL_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 3_000;
const cache = new Map<string, { ok: boolean; at: number }>();

const HARD_MISS = new Set(["ENOTFOUND", "ENODATA", "ENONAME", "NXDOMAIN"]);

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) => setTimeout(() => reject(Object.assign(new Error("timeout"), { code: "ETIMEOUT" })), TIMEOUT_MS).unref()),
  ]);
}

async function lookup(domain: string): Promise<boolean> {
  try {
    const mx = await withTimeout(dns.resolveMx(domain));
    if (mx.some((r) => r.exchange && r.exchange !== ".")) return true;
    // "Null MX" (RFC 7505) → posta kabul etmiyor.
    if (mx.length > 0) return false;
  } catch (err) {
    const code = (err as { code?: string }).code ?? "";
    if (!HARD_MISS.has(code)) return true;
  }
  try {
    const a = await withTimeout(dns.resolve(domain));
    return a.length > 0;
  } catch (err) {
    const code = (err as { code?: string }).code ?? "";
    return !HARD_MISS.has(code);
  }
}

export async function hasMailExchanger(emailOrDomain: string): Promise<boolean> {
  const domain = (emailOrDomain.includes("@") ? emailOrDomain.split("@")[1] : emailOrDomain)?.trim().toLowerCase() ?? "";
  if (!domain || !domain.includes(".")) return false;
  const hit = cache.get(domain);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.ok;
  const ok = await lookup(domain);
  cache.set(domain, { ok, at: Date.now() });
  return ok;
}

export type MxChecker = (emailOrDomain: string) => Promise<boolean>;
