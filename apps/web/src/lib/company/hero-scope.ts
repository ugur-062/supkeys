/**
 * Hero kapsam pili ("Ürün | Firma") oturum belleği (2026-09-10, kullanıcı):
 * anasayfadan bir firmaya girip GERİ dönünce liste yine "Firma"da açılsın.
 * sessionStorage — sekme kapanınca sıfırlanır; sunucu her zaman "products"
 * basar, değer efektte okunur (hidrasyon uyuşmazlığı yok).
 */
export type HeroScope = "products" | "suppliers";

const KEY = "rothern.hero-scope:";

export function readHeroScope(area: string): HeroScope | null {
  try {
    const v = window.sessionStorage.getItem(KEY + area);
    return v === "suppliers" || v === "products" ? v : null;
  } catch {
    return null;
  }
}

export function writeHeroScope(area: string, scope: HeroScope): void {
  try {
    window.sessionStorage.setItem(KEY + area, scope);
  } catch {
    /* depolama kapalı — oturum boyunca state yeter */
  }
}
