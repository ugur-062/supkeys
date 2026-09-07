/**
 * PANELDE SON ARAMALAR — ürün tavsiyesinin girdisi (2026-09-07).
 *
 * Anasayfadaki tavsiye şeridi "kişinin aramalarına ve kategorilerine göre"
 * olacak (kullanıcı kararı). Kategori tarafı SUNUCUDA zaten var (alıcının
 * ALIM kategorileriyle örtüşen ürünler `matchesProfile` ile öne çıkar);
 * arama tarafı için bir geçmiş gerekiyordu ve sunucuda arama logu YOK —
 * tutulmuyor ve yalnız bunun için bir tablo açmak istemedik.
 *
 * Bu yüzden geçmiş TARAYICI-YERELDİR: kullanıcının kendi cihazında kalır,
 * sunucuya gitmez, başka kullanıcıya sızmaz. Sınırı da bu: başka cihazda
 * tavsiye yalnız kategoriye dayanır (dürüst bozulma — şerit yine dolu).
 *
 * Okuma ve yazma try/catch: gizli sekmede ve site verisi kapalı tarayıcıda
 * `localStorage` erişiminin KENDİSİ fırlatır.
 */
const KEY = "rothern.panel.recent-searches";
const MAX = 5;

/** Portal başına ayrı liste: satınalma "vana" arar, satış "havlu" — karışmasın. */
type Portal = "satinalma" | "satis";

function read(): Record<string, string[]> {
  try {
    const raw = window.localStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, string[]>) : {};
  } catch {
    return {};
  }
}

export function recentSearches(portal: Portal): string[] {
  const all = read()[portal];
  return Array.isArray(all) ? all.filter((x) => typeof x === "string" && x.trim()).slice(0, MAX) : [];
}

/** En öne ekler, tekrarı kaldırır, `MAX` ile kırpar. Kısa terim yazılmaz. */
export function rememberSearch(portal: Portal, term: string): void {
  const t = term.trim();
  if (t.length < 2) return;
  try {
    const all = read();
    const fold = (s: string) => s.toLocaleLowerCase("tr");
    const next = [t, ...(all[portal] ?? []).filter((x) => fold(x) !== fold(t))].slice(0, MAX);
    window.localStorage.setItem(KEY, JSON.stringify({ ...all, [portal]: next }));
  } catch {
    /* depolama kapalı — tavsiye kategoriye düşer */
  }
}
