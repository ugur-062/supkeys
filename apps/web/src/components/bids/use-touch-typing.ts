"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * DOKUNMATİK CİHAZDA YAZILIYOR MU — ekran klavyesi açık mı (mobil denetim
 * 2026-10 g08).
 *
 * Teklif formunun sabit alt çubuğu (TOPLAM + Teklif Gönder) ekranın altına
 * yapışık. Yerel uygulama kabuğunda (Capacitor `adjustResize`, iOS
 * `resize: native`) klavye açılınca görünüm alanı kısalır ve çubuk klavyenin
 * hemen üstüne biner; çubuğun hemen üstündeki alana dokunan kullanıcı yazdığını
 * çubuğun ALTINDA görüyordu (tarayıcı odaklanan alanı yalnız tamamen ekran
 * dışındaysa kaydırır, sabit çubukları hesaba katmaz). Kanca, kök (`root`)
 * içindeki klavye açan bir alan odaktayken `true` döner; çağıran çubuğu o
 * sürede gizler.
 *
 * - Yalnız birincil işaretçisi kaba cihazda (`(pointer: coarse)`; telefon,
 *   tablet, kabuk). Fareyle dar pencerede çubuk yerinde kalır.
 * - Klavye açan alan: metin/sayı girişi, `textarea`, `contenteditable`. Onay
 *   kutusu, dosya, tarih seçici ve `select` klavye açmaz → çubuk kalır.
 * - Android'de geri tuşu klavyeyi kapatır ama odağı alandan ALMAZ: görünüm
 *   alanı klavye açıkken kısalıp sonra eski yüksekliğine döndüyse klavye
 *   kapanmış sayılır ve çubuk geri gelir (sonraki odakta ya da aynı alana
 *   yeniden dokunulup klavye tekrar açılınca yeniden gizlenir).
 *   Görünüm alanını kısaltmayan platformda (klavye içeriğin üstüne biner)
 *   çubuk odak süresince gizli kalır — klavyenin arkasında zaten görünmezdi.
 * - Sunucuda ve `matchMedia` olmayan ortamda hep `false`.
 */
const COARSE_QUERY = "(pointer: coarse)";
/** Görünüm alanı bu kadar kısalınca ekran klavyesi açık sayılır (px). */
const KEYBOARD_MIN_PX = 120;

const NON_TEXT_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "date",
  "datetime-local",
  "file",
  "hidden",
  "image",
  "month",
  "radio",
  "range",
  "reset",
  "submit",
  "time",
  "week",
]);

/** Odaklanınca ekran klavyesi açan, düzenlenebilir alan mı. */
export function opensKeyboard(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLInputElement) {
    if (el.readOnly || el.disabled) return false;
    return !NON_TEXT_INPUT_TYPES.has(el.type);
  }
  return el instanceof HTMLElement && el.isContentEditable;
}

export function useTouchTyping(root: RefObject<HTMLElement | null>): boolean {
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(COARSE_QUERY);
    const vv = window.visualViewport ?? null;
    const height = () => vv?.height ?? window.innerHeight;

    // Klavyesiz görünüm yüksekliği — genişlik değişince (döndürme) yeniden ölçülür.
    let baseWidth = window.innerWidth;
    let baseHeight = height();
    // Odaktaki alan için klavyenin açıldığı görüldü mü; açılıp kapandı mı.
    let keyboardOpen = false;
    let closedWhileFocused = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const shrunk = () => baseHeight - height() >= KEYBOARD_MIN_PX;
    // Kök OLAY anında okunur: form, kanca bağlandıktan sonra (yükleme ekranından
    // sonra) çizilir; dinleyiciler bu yüzden belgeye bağlıdır.
    const focusedField = () => {
      const active = document.activeElement;
      return mql.matches && !!root.current?.contains(active) && opensKeyboard(active);
    };
    const update = () => setTyping(focusedField() && !closedWhileFocused);

    const onFocusIn = () => {
      closedWhileFocused = false;
      keyboardOpen = shrunk();
      update();
    };
    // Alandan alana geçerken önce `focusout` gelir (activeElement henüz gövde);
    // karar bir sonraki görevde, yeni odak yerleşince verilir.
    const onFocusOut = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        if (!focusedField()) closedWhileFocused = false;
        update();
      }, 0);
    };
    const onResize = () => {
      if (window.innerWidth !== baseWidth) {
        baseWidth = window.innerWidth;
        baseHeight = height();
        keyboardOpen = false;
        update();
        return;
      }
      if (height() > baseHeight) baseHeight = height();
      if (shrunk()) {
        keyboardOpen = true;
        // Klavye odaktaki alanda YENİDEN açıldı (geri tuşuyla kapatılan alana
        // tekrar dokunuldu — odak değişmediği için `focusin` gelmez) → çubuk
        // yine gizlenir.
        closedWhileFocused = false;
      } else if (keyboardOpen) {
        keyboardOpen = false;
        if (focusedField()) closedWhileFocused = true;
      }
      update();
    };

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    vv?.addEventListener("resize", onResize);
    window.addEventListener("resize", onResize);
    mql.addEventListener?.("change", update);
    update();
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      vv?.removeEventListener("resize", onResize);
      window.removeEventListener("resize", onResize);
      mql.removeEventListener?.("change", update);
    };
  }, [root]);

  return typing;
}
