"use client";

import { rootScrollPaddingTopFor, topbarHeightPx } from "@/lib/safe-area";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Panel kabuğunun SABİT üst çubuğu (`--topbar-h` = 56 px + güvenli alanın üst
 * payı; `topbarHeightPx`) + nefes payı. Görünürlük denetimi alanın bunun
 * ALTINDA kalmasını ister (mobil denetim 2026-10 g06: Talep Şartları'nda
 * odaklanan "Özel gün" kutusu y = 0–37'de, üst çubuğun ve toast'ın altında
 * kalıyordu). Kök `scroll-padding-top` daha büyükse o geçerli.
 */
const EDGE_MARGIN_PX = 8;

/**
 * Geçersiz alan işareti: denetimin kendi `aria-invalid`'i; `aria-invalid`
 * taşıyamayan özel denetimin (kategori seçici, kalemin "Detay" düğmesi) KABI
 * `data-reveal-invalid="true"` taşır — DOM sırasına aynı sorguyla girer.
 */
export const INVALID_FIELD_SELECTOR = '[aria-invalid="true"], [data-reveal-invalid="true"]';

/** Odak alabilen ilk öğe (kap verildiyse içinde aranır). */
const FOCUSABLE =
  'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/**
 * Ekranın üstünü örten sabit/yapışkan çubuğun alt kenarı (px) — yerel uygulama
 * kabuğunda güvenli alan payıyla 56 px'ten uzun olabilir, bu yüzden ölçülür.
 * Ekranın üçte birinden uzun katman (pencere örtüsü) çubuk sayılmaz → 0.
 */
function measuredTopBar(): number {
  if (typeof document.elementFromPoint !== "function") return 0;
  let el = document.elementFromPoint(window.innerWidth / 2, 1);
  while (el && el !== document.body && el !== document.documentElement) {
    const pos = getComputedStyle(el).position;
    if (pos === "fixed" || pos === "sticky") {
      const bottom = el.getBoundingClientRect().bottom;
      return bottom > 0 && bottom < window.innerHeight / 3 ? bottom : 0;
    }
    el = el.parentElement;
  }
  return 0;
}

function topInset(): number {
  let pad = 0;
  try {
    pad = Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
  } catch {
    pad = 0;
  }
  return Math.max(topbarHeightPx() + EDGE_MARGIN_PX, measuredTopBar() + EDGE_MARGIN_PX, pad);
}

/** Görünür alanın alt sınırı — ekran klavyesi açıksa görsel görünüm alanı (visualViewport). */
function bottomLimit(): number {
  const vv = typeof window !== "undefined" ? window.visualViewport : null;
  const visual = vv ? vv.offsetTop + vv.height : window.innerHeight;
  return Math.min(window.innerHeight, visual) - EDGE_MARGIN_PX;
}

/**
 * GEÇERSİZ ALANI GÖSTER — odak + kaydırma TEK yerden (kimlik formları, hızlı
 * talep, Talep Şartları, "Özel gün" kapısı).
 *
 * Sıra önemli: önce odak KAYDIRMASIZ verilir, sonra gerekirse kaydırılır.
 * Eski kapı `scrollIntoView({ behavior: "smooth" })` + düz `focus()` çağırıyordu;
 * `focus()` yumuşak kaydırmayı İPTAL ediyor, alan y = 0'da "görünür" sayılıp
 * sabit üst çubuğun altında kalıyordu (mobil denetim 2026-10 g06, 390 px).
 * Kaydırma anında (`behavior` verilmez) — ardından gelen odak / toast onu kesemez.
 *
 * - Kapalı `<details>` içindeki alan önce açılır (kalem "Detaylar"ı).
 * - `control` odaklanamayan bir kapsa (kategori kutusu) içindeki ilk denetim odaklanır.
 * - Alanın kabı (Catalyst `data-slot="field"`; yoksa denetimin kendisi + etiketi)
 *   üst çubuğun altında ve klavyenin üstünde TAM görünmüyorsa ortalanır.
 */
export function revealInvalidControl(control: HTMLElement): void {
  for (let d = control.closest("details"); d; d = d.parentElement?.closest("details") ?? null) {
    if (!d.open) d.open = true;
  }
  const focusTarget = control.matches(FOCUSABLE) ? control : control.querySelector<HTMLElement>(FOCUSABLE);
  focusTarget?.focus({ preventScroll: true });

  const box = control.closest<HTMLElement>('[data-slot="field"]') ?? control;
  const rect = box.getBoundingClientRect();
  // Kap yoksa denetimin etiketi de görünmeli (tarayıcı odağı etiketi dışarıda bırakıyordu).
  const label = box === control && control instanceof HTMLInputElement ? control.labels?.[0] : undefined;
  const labelTop = label ? label.getBoundingClientRect().top : rect.top;
  const top = Math.min(rect.top, labelTop);
  const minTop = topInset();
  const bottom = bottomLimit();
  if (top >= minTop && rect.bottom <= bottom) return;
  const height = rect.bottom - top;
  if (height <= bottom - 2 * minTop) {
    box.scrollIntoView?.({ block: "center" });
    return;
  }
  // Ortalanınca üst kenarı (etiket) çubuğun altına düşecek kadar uzun kap: üst
  // kenar çubuğun hemen altına hizalanır (geçici scroll-margin — iç içe kaydırma
  // kaplarında da çalışır). Belge kaydırmasında kökün `scroll-padding-top`u
  // (güvenli alanın üst payı) bu paya EKLENİR; `minTop` onu zaten içerir → düşülür.
  const prev = box.style.scrollMarginTop;
  box.style.scrollMarginTop = `${Math.max(0, minTop + (rect.top - top) - rootScrollPaddingTopFor(box))}px`;
  box.scrollIntoView?.({ block: "start" });
  box.style.scrollMarginTop = prev;
}

/**
 * `root` içindeki İLK geçersiz alanı (DOM = görsel sıra, `INVALID_FIELD_SELECTOR`)
 * gösterir; bulamazsa `false` döner (çağıran bölüme düşer). `within` verilirse
 * yalnız o seçiciye uyan kapların içindeki alanlar aranır.
 */
export function revealFirstInvalid(root: ParentNode = document, within?: string): boolean {
  const selector = within
    ? INVALID_FIELD_SELECTOR.split(",").map((s) => `${within} ${s.trim()}`).join(", ")
    : INVALID_FIELD_SELECTOR;
  const control = root.querySelector<HTMLElement>(selector);
  if (!control) return false;
  revealInvalidControl(control);
  return true;
}

/**
 * GEÇERSİZ İLK ALANA ODAK (arayüz testi 2026-10 signup-tr-8, code-auth-9).
 *
 * Kimlik formlarında gönder düğmesi sessizce pasif KALMAZ: basılınca geçersiz
 * her alan `aria-invalid` olur, iletisi altında çizilir ve odak ilk geçersiz
 * alana gider. Alanlar hatayı bir sonraki çizimde alır → odak, çizimden SONRA
 * çalışan efektte ve DOM sırasıyla (görsel sıra) bulunur; alan başına ref
 * tutmaya gerek kalmaz (onay kutuları dahil — `role="checkbox"` odaklanabilir).
 *
 * Kullanım: `ref` forma verilir; doğrulama düşünce `focusFirstInvalid()`.
 * İsteğe bağlı `fallback`: geçersiz alan bulunamazsa çağrılır (bölüme kaydır).
 */
export function useFocusFirstInvalid<T extends HTMLElement = HTMLFormElement>() {
  const ref = useRef<T>(null);
  const [tick, setTick] = useState(0);
  const fallbackRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!tick) return;
    const fallback = fallbackRef.current;
    fallbackRef.current = null;
    const root = ref.current;
    if (root && revealFirstInvalid(root)) return;
    fallback?.();
  }, [tick]);
  // `unknown`: düğmenin `onClick`ine doğrudan verilebilsin (olay nesnesi yok sayılır).
  const focusFirstInvalid = useCallback((fallback?: unknown) => {
    fallbackRef.current = typeof fallback === "function" ? (fallback as () => void) : null;
    setTick((n) => n + 1);
  }, []);
  return { ref, focusFirstInvalid };
}
