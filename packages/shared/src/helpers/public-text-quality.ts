/**
 * HERKESE AÇIK METİN KALİTESİ — tek kaynak (2026-09-04).
 *
 * Canlıda bir firmanın "Hakkında" alanı anlamsız bir harf dizisiydi
 * ("PSKDFMOKAND…") ve profil `publicEnabled` olduğu için herkese açık
 * sayfada, dizin kartında ve OG açıklamasında görünüyordu. Test verisi
 * ziyaretçiye "site bozuk" der; arama motoruna "ince/çöp içerik" der.
 *
 * Kural bir SÖZLÜK değil, ucuz bir düzyazı sezgisi (sözlük 158k kategori adı
 * gibi teknik jargonu da reddederdi):
 *   · en az 40 karakter,
 *   · en az 3 sözcük,
 *   · sözcüklerin en az %60'ı sesli harf içerir (Türkçe sesliler dahil),
 *   · ortalama sözcük uzunluğu ≤ 14 (uzun tek blok = klavye gürültüsü).
 *
 * 2026-09-04: `@rothern/shared`a taşındı — API (public projeksiyon, dizin
 * tamlığı) ve WEB paneli (başka firmanın profili) AYNI sezgiyi okur; iki
 * yüzey ayrışırsa üye, ziyaretçinin görmediği test verisini görür.
 *
 * Geçmeyen metin herkese açık yüzeyde HİÇ gösterilmez; kayıt panelde durur,
 * sahibi düzeltir. Bu yüzden kural yalnız OKUMA yolunda uygulanır — yazmayı
 * engellemek, kullanıcıyı taslak kaydetmekten alıkoyardı.
 */
const VOWELS = /[aeıioöuüâîû]/i;

export const PUBLIC_TEXT_MIN_CHARS = 40;

export function looksLikeProse(text: string | null | undefined): boolean {
  if (!text) return false;
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length < PUBLIC_TEXT_MIN_CHARS) return false;
  const words = flat.split(" ").filter((w) => /[\p{L}\p{N}]/u.test(w));
  if (words.length < 3) return false;
  const withVowel = words.filter((w) => VOWELS.test(w)).length;
  if (withVowel / words.length < 0.6) return false;
  const avgLen = words.reduce((s, w) => s + w.length, 0) / words.length;
  return avgLen <= 14;
}

/**
 * Anonim ziyaretçiye gösterilecek "Hakkında" kesiti: ilk iki satır ya da
 * ~240 karakter — hangisi önce biterse. Kesildiyse `truncated: true`; web
 * "devamı için giriş yapın" bağlantısını yalnız o zaman basar.
 */
export function publicExcerpt(
  text: string | null | undefined,
  maxChars = 240,
  maxLines = 2,
): { excerpt: string | null; truncated: boolean } {
  if (!looksLikeProse(text)) return { excerpt: null, truncated: false };
  const trimmed = (text as string).trim();
  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
  let out = lines.slice(0, maxLines).join("\n");
  let truncated = lines.length > maxLines;
  if (out.length > maxChars) {
    // Sözcük sınırında kes — yarım sözcükle biten kesit editör hatası gibi okunur.
    const cut = out.slice(0, maxChars);
    const lastSpace = cut.lastIndexOf(" ");
    out = `${(lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
    truncated = true;
  }
  return { excerpt: out, truncated };
}
