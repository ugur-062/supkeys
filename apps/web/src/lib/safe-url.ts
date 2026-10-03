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

/**
 * Bağlantı alanının `maxLength`'i: kayıtta `safeExternalUrl` şemasız girdiye
 * `https://` ve çıplak alan adına `/` ekler; sınır normalize edilmiş adrese
 * uygulanır. Kutu ham girdiyi `max`'a kadar kabul edip kayıtta "çok uzun"
 * demesin diye ekin payı düşülür (arayüz testi D-054, yeniden doğrulama).
 */
export function linkInputMaxLength(raw: string, max: number): number {
  const t = raw.trim();
  // Boş kutu: yapıştırılan tam adres (`https://…`) kırpılmasın; pay ilk karakterle hesaplanır.
  if (!t) return max;
  const norm = safeExternalUrl(t);
  const overhead = norm
    ? Math.max(0, norm.length - t.length)
    : /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(t)
      ? 0
      : "https://".length + 1;
  // Baştaki/sondaki boşluklar kayıtta kırpılır; kutuda yer kaplamaları sınırı daraltmasın.
  return Math.max(0, max - overhead + (raw.length - t.length));
}

/**
 * Bağlantı kutusuna gelen değeri kaydedilebilir uzunluğa kırpar. `maxLength`
 * öznitelik olarak yalnız kutunun O ANKİ değerinden hesaplanır: boş kutu tam
 * adres yapıştırılabilsin diye `max` kabul eder, bu yüzden şemasız uzun bir
 * yapıştırma (ör. 150 karakter, kayıtta `https://` ile 158) kutuya sığıp
 * Kaydet'te "çok uzun" diye takılıyordu (arayüz testi son tur webC-05 NEW-3).
 * onChange'de bu fonksiyondan geçen değer, tarayıcının yazmada uyguladığı
 * sınırla aynıdır: kutunun kabul ettiği her değer kaydedilir.
 */
export function clampLinkInput(raw: string, max: number): string {
  let v = raw;
  // Kırpma normalize payını değiştirebilir (ör. şema kesilirse `https://`
  // eklenir); sabitlenene dek tekrarla — birkaç turda biter.
  for (let i = 0; i < 4; i++) {
    const allowed = linkInputMaxLength(v, max);
    if (v.length <= allowed) return v;
    v = v.slice(0, allowed);
  }
  return v;
}
