/**
 * Dış bağlantı URL'sini güvenli hale getirir — YALNIZ http/https izinli.
 * `javascript:`, `data:`, `vbscript:` vb. şemalar → `null` (linki düşür).
 * Şema yoksa `https://` varsayılır ("foo.com" → "https://foo.com").
 *
 * Neden: kullanıcı-kontrollü `website`/`linkedinUrl`/`instagramUrl` ham `<a href>`
 * olarak render edilirse `href="javascript:alert(document.cookie)"` tıklamada
 * XSS olur (özellikle PUBLIC /firma/[slug] sayfasında). Render sınırında bunu
 * çağır; `null` dönerse anchor'ı HİÇ basma.
 *
 * NOT: `host:port` (şemasız, ör. "foo.com:8080") güvenli tarafta DÜŞÜRÜLÜR —
 * şema/host ayrımı `//` olmadan belirsizdir; kullanıcı `https://` ile yazmalı.
 */
export function safeExternalUrl(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (!t) return null;

  const schemeMatch = t.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
  let candidate: string;
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase();
    if (scheme !== "http" && scheme !== "https") return null;
    candidate = t;
  } else {
    candidate = `https://${t}`;
  }

  try {
    const u = new URL(candidate);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname) return null;
    return u.href;
  } catch {
    return null;
  }
}
