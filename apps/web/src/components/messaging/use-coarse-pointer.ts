"use client";

import type { KeyboardEvent } from "react";
import { useSyncExternalStore } from "react";

/**
 * DOKUNMATİK CİHAZ = birincil işaretçi "kaba" (`(pointer: coarse)`; telefon,
 * tablet, Capacitor kabuğu). Mobil denetim g04 (kullanıcı kararı): telefonda
 * ekran klavyesinin Enter'ı mesajı GÖNDERMEZ, yeni satır açar — Shift+Enter
 * yok, çok satırlı mesaj yazılamıyor, yarım metin gidiyordu. Gönderim yalnız
 * Gönder düğmesiyle; masaüstü (ince işaretçi) bugünkü gibi.
 *
 * Karar tuşa basıldığı AN `isCoarsePointer()` ile okunur (işaretçi oturum
 * içinde değişebilir: tablete klavye/fare takılması); çizim tarafı (ipucu
 * metni, `enterKeyHint`) `useCoarsePointer()` ile izler. Sunucuda ve
 * `matchMedia` olmayan ortamda masaüstü varsayılır.
 */
const COARSE_QUERY = "(pointer: coarse)";

function mediaQuery(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
  return window.matchMedia(COARSE_QUERY);
}

export function isCoarsePointer(): boolean {
  return mediaQuery()?.matches === true;
}

function subscribe(onChange: () => void): () => void {
  const mql = mediaQuery();
  if (!mql || typeof mql.addEventListener !== "function") return () => {};
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

export function useCoarsePointer(): boolean {
  return useSyncExternalStore(subscribe, isCoarsePointer, () => false);
}

/**
 * IME bileşimi (Japonca/Çince aday seçimi) Enter'ı onaylamak için kullanır —
 * o Enter hiçbir şey göndermez (arayüz testi D-356).
 */
export function isImeComposing(e: KeyboardEvent<HTMLElement>): boolean {
  return e.nativeEvent.isComposing || e.keyCode === 229;
}

/**
 * Sohbet kutusu kuralı: masaüstünde Enter gönderir (Shift+Enter yeni satır),
 * dokunmatik cihazda Enter her zaman yeni satırdır.
 */
export function enterSendsMessage(e: KeyboardEvent<HTMLElement>): boolean {
  if (e.key !== "Enter" || e.shiftKey || isImeComposing(e)) return false;
  return !isCoarsePointer();
}

/**
 * Yanıt kutusu kuralı (bilgi talepleri): masaüstünde Ctrl/⌘+Enter gönderir,
 * düz Enter yeni satırdır; dokunmatik cihazda kısayol yok (aynı kural).
 */
export function modEnterSendsReply(e: KeyboardEvent<HTMLElement>): boolean {
  if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey) || isImeComposing(e)) return false;
  return !isCoarsePointer();
}
