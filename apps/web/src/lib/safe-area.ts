/**
 * GÜVENLİ ALAN — JS tarafı (mobil kabuk 2026-10).
 *
 * Belirteçler `app/globals.css` `:root`ta: `--safe-top/right/bottom/left`
 * (çentik, Dinamik Ada, ana ekran çizgisi; payı olmayan cihazda 0) ve
 * `--topbar-h` (panel üst çubuğu: 56 px + üst pay). CSS'in yetmediği yerde
 * (IntersectionObserver `rootMargin`i, elle kaydırma payı) değer buradan
 * PİKSEL olarak okunur.
 *
 * Kök (`<html>`) `scroll-padding-top: var(--safe-top)` taşır: çapa ve odak
 * kaydırmaları `scroll-mt-*` payına üst payı kendiliğinden ekler. Üst çubuğu
 * ÖLÇEREK kaydıran yardımcı (ölçü zaten üst payı içerir) bu kök payı
 * `rootScrollPaddingTopFor` ile düşer — yoksa pay iki kez sayılırdı.
 */

/** Panel üst çubuğunun güvenli alansız yüksekliği (`h-14`). */
export const TOPBAR_BASE_PX = 56;

/**
 * Bir CSS uzunluk ifadesinin (değişkenli `calc` dahil) piksel değeri. Görünmez
 * bir ölçü öğesiyle çözülür — `getPropertyValue("--x")` `calc`/`env` içeren
 * değeri çözmeden döndürür. Ölçülemezse (sunucu, jsdom) `fallback`.
 */
export function cssLengthPx(expression: string, fallback: number): number {
  if (typeof document === "undefined" || !document.body) return fallback;
  try {
    const probe = document.createElement("div");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText =
      "position:absolute;top:0;left:0;width:0;visibility:hidden;pointer-events:none;height:" + expression;
    document.body.appendChild(probe);
    const px = probe.getBoundingClientRect().height;
    probe.remove();
    return Number.isFinite(px) && px > 0 ? px : fallback;
  } catch {
    return fallback;
  }
}

/** Panel üst çubuğunun gerçek yüksekliği (px): 56 + üst güvenli pay. */
export function topbarHeightPx(): number {
  return cssLengthPx("var(--topbar-h, 3.5rem)", TOPBAR_BASE_PX);
}

/** Kökün `scroll-padding-top`u (px) — üst güvenli pay; yoksa 0. */
export function rootScrollPaddingTop(): number {
  if (typeof document === "undefined") return 0;
  try {
    return Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
  } catch {
    return 0;
  }
}

/**
 * `el`i belge (pencere) kaydırıyorsa kökün `scroll-padding-top`u, bir iç
 * kaydırma kabı (pencere gövdesi, liste) kaydırıyorsa 0 — kök payı yalnız
 * belge kaydırmasına uygulanır.
 */
export function rootScrollPaddingTopFor(el: Element): number {
  if (typeof window === "undefined") return 0;
  for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
    let overflowY = "";
    try {
      overflowY = getComputedStyle(p).overflowY;
    } catch {
      overflowY = "";
    }
    if ((overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") && p.scrollHeight > p.clientHeight) {
      return 0;
    }
  }
  return rootScrollPaddingTop();
}
