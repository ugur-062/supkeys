"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  SCROLL_KEEP_TTL_MS,
  captureScroll,
  restoreScrollAfterCommit,
  takeCommittedKeep,
  type ScrollKeep,
} from "./filter-shell-nav";

/** İşleme anında koşan efekt (sunucuda `useEffect` — orada hiçbiri koşmaz). */
const useCommitLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export interface ScrollKeeper {
  /**
   * Gezinmeden HEMEN ÖNCE çağrılır: şu anki sayfa konumu, `url` (DIŞ adres:
   * dil önekli yol + sorgu — `localizePath(iç yol, dil)`) işlenince geri
   * konur. Hâlâ bekleyen önceki hedefler korunur (art arda tıklar).
   */
  capture(url: string): void;
  /** Bekleyen korumayı düşürür (rota değişti, sayfalama, tam gezinme). */
  clear(): void;
}

/**
 * KAYDIRMA KORUMASI — `router.replace/push(…, { scroll: false })` ile AYNI
 * yolda kalan gezinme (süzgeç kabuğu, AI arama bandının çipleri). Next 15.5.25
 * takma adlı ön-getirme yolunda `scroll: false`u yok sayıp işleme anında
 * sayfayı en başa atıyor (kök neden `filter-shell-nav.ts`, 3. iş); bu kanca
 * konumu `capture` anında yakalar, beklerken kullanıcı kaydırırsa izler ve
 * hedef işlendiği an (yerleşim efekti: adres ve geçmiş kaydı yazılmış)
 * `restoreScrollAfterCommit` ile Next'in kaydırmasından hemen sonra, boyamadan
 * önce geri koyar. TEK uygulama: süzgeç kabuğu ve AI bandı bunu kullanır.
 *
 * Kancayı çağıran bileşen adres değişince YENİDEN ÇİZİLMELİ (`useSearchParams`
 * / `usePathname` okur) — işleme anını kendi yerleşim efektinde görür. Dönen
 * nesne bileşen ömrü boyunca aynıdır.
 */
export function useScrollKeep(): ScrollKeeper {
  const keepRef = useRef<ScrollKeep | null>(null);
  useEffect(() => {
    const follow = () => {
      const k = keepRef.current;
      if (k) {
        k.x = window.scrollX || 0;
        k.y = window.scrollY || 0;
      }
    };
    window.addEventListener("scroll", follow, { passive: true });
    return () => window.removeEventListener("scroll", follow);
  }, []);
  useCommitLayoutEffect(() => {
    const keep = keepRef.current;
    if (!keep) return;
    if (Date.now() - keep.at > SCROLL_KEEP_TTL_MS) {
      keepRef.current = null;
      return;
    }
    const hit = takeCommittedKeep(keep);
    if (!hit) return;
    keepRef.current = hit.rest;
    restoreScrollAfterCommit(hit.restore);
  });
  return useMemo<ScrollKeeper>(
    () => ({
      capture: (url) => {
        keepRef.current = captureScroll(url, keepRef.current);
      },
      clear: () => {
        keepRef.current = null;
      },
    }),
    [],
  );
}
