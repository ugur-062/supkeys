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
 * YAZI SİSTEMİ (derin denetim S053, 2026-09-29): sesli harf sınıfı eskiden
 * yalnız Latin/Türkçe idi → Rusça/Kazakça/Yunanca/Arapça her "Hakkında"
 * çöp sayılıyor, profil gizleniyor, hiç indekslenmiyor, firma haksız "profil
 * metni yok" e-postası alıyordu (RU birinci sınıf dil, kayıt tüm ülkelere
 * açık). Artık: Latin (aksanlar NFD ile soyulur), Kiril ve Yunan sesliler
 * tanınır; sesli harf kavramı basit olmayan yazılarda (Arap/İbrani abcedleri,
 * Hint abugidaları, Gürcü, Ermeni…) harf içeren sözcük oranı geçer sayılır;
 * boşluksuz yazılarda (Çince/Japonca/Tay) sözcük kuralları uygulanmaz,
 * uzunluk kuralı kalır. Salt rakam sözcük yine sesli sayılmaz.
 *
 * 2026-09-04: `@rothern/shared`a taşındı — API (public projeksiyon, dizin
 * tamlığı) ve WEB paneli (başka firmanın profili) AYNI sezgiyi okur; iki
 * yüzey ayrışırsa üye, ziyaretçinin görmediği test verisini görür.
 *
 * Geçmeyen metin herkese açık yüzeyde HİÇ gösterilmez; kayıt panelde durur,
 * sahibi düzeltir. Bu yüzden kural yalnız OKUMA yolunda uygulanır — yazmayı
 * engellemek, kullanıcıyı taslak kaydetmekten alıkoyardı.
 */
const LATIN_VOWELS = /[aeiouıæøœ]/iu;
const CYRILLIC_VOWELS = /[аеиоуыэюяієөүұә]/iu; // ё/й/ї NFD'de е/и/і'ye iner
const GREEK_VOWELS = /[αεηιουω]/iu; // tonos NFD'de soyulur
const VOWEL_SCRIPTS = /[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}]/u;
const SPACELESS_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/gu;

function hasVowel(word: string): boolean {
  const base = word.normalize("NFD").replace(/\p{M}/gu, "");
  if (LATIN_VOWELS.test(base) || CYRILLIC_VOWELS.test(base) || GREEK_VOWELS.test(base)) return true;
  // Sesli harf testi yapılamayan yazı: harf var ve Latin/Kiril/Yunan değil.
  return /\p{L}/u.test(base) && !VOWEL_SCRIPTS.test(base);
}

export const PUBLIC_TEXT_MIN_CHARS = 40;

export function looksLikeProse(text: string | null | undefined): boolean {
  if (!text) return false;
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length < PUBLIC_TEXT_MIN_CHARS) return false;
  // Boşluksuz yazı baskınsa sözcük sayısı/uzunluğu anlamsız — uzunluk yeter.
  const letters = flat.match(/\p{L}/gu)?.length ?? 0;
  const spaceless = flat.match(SPACELESS_SCRIPT)?.length ?? 0;
  if (letters > 0 && spaceless / letters >= 0.5) return true;
  const words = flat.split(" ").filter((w) => /[\p{L}\p{N}]/u.test(w));
  if (words.length < 3) return false;
  const withVowel = words.filter(hasVowel).length;
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
