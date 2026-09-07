/**
 * IZGARA ↔ LİSTE tercihi — kalıcı, tarayıcı-yerel.
 *
 * Doğruluk kaynağı URL'dir (`?gorunum=liste`): paylaşılan bağlantı karşı
 * tarafta AYNI düzende açılmalı. `localStorage` yalnız "bu tarayıcıda en son
 * neyi seçmiştim" bilgisidir — URL'de `gorunum` YOKKEN geri yüklenir, VARKEN
 * asla ezmez.
 *
 * Okuma ve yazma try/catch: gizli sekme, site verisi kapalı tarayıcı ve
 * küçük resim/önizleme bağlamlarında `localStorage` erişiminin KENDİSİ
 * fırlatır. Tercih yoksa varsayılan ızgaradır — sayfa her hâlükârda doğru
 * çizilir.
 */
const KEY = "rothern.market.view";

export type MarketView = "liste" | undefined;

export function readViewPreference(): MarketView {
  try {
    return window.localStorage.getItem(KEY) === "liste" ? "liste" : undefined;
  } catch {
    return undefined;
  }
}

export function writeViewPreference(view: MarketView): void {
  try {
    if (view === "liste") window.localStorage.setItem(KEY, "liste");
    else window.localStorage.removeItem(KEY);
  } catch {
    /* depolama kapalı — tercih yalnız bu sayfa ömrü boyunca yaşar */
  }
}
