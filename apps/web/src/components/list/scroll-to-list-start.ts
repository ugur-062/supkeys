/**
 * SAYFA DEĞİŞİNCE LİSTENİN BAŞINA (mobil denetim 2026-10 g06/g07/g08).
 *
 * İstemci sayfalaması yalnız satırları değiştiriyordu: alttaki sayfalamaya
 * dokunan kullanıcı yeni sayfanın SONUNDA kalıyor, telefonda 20 uzun kartı
 * yukarı kaydırarak ilk sonuca dönüyordu (Taleplerim, Siparişlerim,
 * Tekliflerim, Satışlarım). Sayfalama listenin ALTINDA çizildiği için listenin
 * başı, sayfalamadan önceki ilk kardeştir; sayfalama bir sarmalayıcının ilk
 * çocuğuysa sarmalayıcıdan çıkılarak aranır. Çağıran sayfaların hiçbiri
 * değişmeden hepsi aynı davranışı alır.
 *
 * Liste başı zaten görünüyorsa (kısa liste, kullanıcı üstte) kaydırılmaz.
 * Sabit üst çubuk (panelde h-14; yerel kabukta güvenli alan payıyla daha
 * uzun) ölçülerek pay bırakılır — sabit 56 px yazılsaydı çentikli telefonda
 * listenin başı çubuğun altında kalırdı.
 */

import { rootScrollPaddingTopFor } from "@/lib/safe-area";

/** Liste başı ile sabit üst çubuk arasında bırakılan nefes payı (px). */
const GAP_PX = 12;

/** Sayfalama köklerinin işareti — tıklanan düğmeden köke çıkmak için. */
export const PAGINATION_ROOT_ATTR = "data-pagination-root";

/**
 * Sayfalama kökünden geriye doğru listenin başını bulur. `from` kökün
 * kendisi ya da içindeki bir düğme olabilir (düğmenin kardeşi bir önceki
 * sayfa numarasıdır, liste değil — önce köke çıkılır).
 */
export function findListStart(from: Element | null): HTMLElement | null {
  if (!from || typeof document === "undefined") return null;
  let node: Element | null = from.closest(`[${PAGINATION_ROOT_ATTR}]`) ?? from;
  // Sayfa içeriğinin (`main`) dışına çıkılmaz: orada önceki kardeş kabuğun
  // menüsü/üst çubuğudur, liste değil.
  const stop = (n: Element) => n === document.body || n.tagName === "MAIN";
  while (node && !stop(node) && !node.previousElementSibling) node = node.parentElement;
  if (!node || stop(node)) return null;
  const prev = node.previousElementSibling;
  return prev instanceof HTMLElement ? prev : null;
}

/**
 * Ekranın üstünü örten sabit/yapışkan katmanın alt kenarı (px). Üst çubuk
 * yoksa 0. Ekranın üçte birinden uzun bir katman (tam ekran örtü) sayılmaz.
 */
function fixedTopInset(): number {
  if (typeof document.elementFromPoint !== "function") return 0;
  let el = document.elementFromPoint(window.innerWidth / 2, 1);
  while (el && el !== document.body && el !== document.documentElement) {
    const pos = window.getComputedStyle(el).position;
    if (pos === "fixed" || pos === "sticky") {
      const bottom = el.getBoundingClientRect().bottom;
      return bottom > 0 && bottom < window.innerHeight / 3 ? bottom : 0;
    }
    el = el.parentElement;
  }
  return 0;
}

/**
 * `from` (sayfalama düğmesi ya da kökü) üstündeki listenin başını sabit üst
 * çubuğun hemen altına getirir. Liste başı görünür alandaysa dokunmaz.
 */
export function scrollToListStart(from: Element | null): void {
  if (typeof window === "undefined") return;
  const start = findListStart(from);
  if (!start) return;
  const inset = fixedTopInset() + GAP_PX;
  if (start.getBoundingClientRect().top >= inset) return;
  // `scrollIntoView` iç kaydırma kaplarında da çalışır (pencere dışında
  // kayan bir panel); pay `scroll-margin-top` ile verilir ve geri alınır.
  // Belge kaydırmasında kökün `scroll-padding-top`u (güvenli alanın üst payı)
  // bu paya eklenir; ölçülen çubuk onu zaten içerir → düşülür.
  const prevMargin = start.style.scrollMarginTop;
  start.style.scrollMarginTop = `${Math.max(0, inset - rootScrollPaddingTopFor(start))}px`;
  start.scrollIntoView?.({ block: "start" });
  start.style.scrollMarginTop = prevMargin;
}
