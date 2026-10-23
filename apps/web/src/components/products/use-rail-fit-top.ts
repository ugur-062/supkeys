"use client";

import { useLayoutEffect, type RefObject } from "react";

/** Tailwind `lg:` kırılımı — ray yalnız orada yapışkan ve yüksekliği sınırlı. */
export const RAIL_FIT_QUERY = "(min-width: 64rem)";
/** Rayın o anki üst kenarı (px) — `product-showcase-form.tsx` rayının `max-h` formülü okur. */
export const RAIL_FIT_TOP_VAR = "--rail-fit-top";

/**
 * YAPIŞKAN RAY GÖRÜNÜR ALANA SIĞAR (mobil denetim r6, masaüstü): rayın
 * yüksekliği CSS'te `100dvh − max(yapışma ofseti, rayın o anki üstü) − AI
 * düğmesinin payı` ile sınırlı ve ray kendi içinde kayar. Yapışma ofseti CSS'te
 * bilinir; rayın HENÜZ yapışmadığı ilk görünümde (sayfanın başı) üst kenarı
 * daha aşağıdadır — bu kanca o değeri `--rail-fit-top` olarak rayın kendisine
 * yazar, böylece ilk görünümde de ray AI düğmesinin üstünde biter (eskiden
 * alt kenarı ekranın altına, düğmenin altına iniyordu).
 *
 * Geri besleme yok: rayın üst kenarı kendi yüksekliğinden bağımsız (ızgara
 * satırının başında, `self-start`); formun sonunda ray yukarı itilince değer
 * yapışma ofsetinin altına iner ve formüldeki `max()` ofseti seçer.
 * Yalnız lg ve üstünde dinler; daha darda değişkeni siler. Değer yalnız
 * değişince yazılır (yapışmış rayda kaydırma hiçbir şey yazmaz).
 */
export function useRailFitTop(
  railRef: RefObject<HTMLElement | null>,
  /** Rayın üstündeki düzeni (eylem çubuğu, red notu) taşıyan kap — boyutu değişince yeniden ölçülür. */
  layoutRef?: RefObject<HTMLElement | null>,
) {
  useLayoutEffect(() => {
    const rail = railRef.current;
    if (!rail || typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(RAIL_FIT_QUERY);
    let raf = 0;
    let last: string | null = null;
    let listening = false;

    const write = () => {
      raf = 0;
      const value = mq.matches ? `${Math.round(rail.getBoundingClientRect().top)}px` : null;
      if (value === last) return;
      last = value;
      if (value === null) rail.style.removeProperty(RAIL_FIT_TOP_VAR);
      else rail.style.setProperty(RAIL_FIT_TOP_VAR, value);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(write);
    };
    const observer =
      typeof ResizeObserver !== "undefined" && layoutRef?.current ? new ResizeObserver(schedule) : null;

    const listen = (on: boolean) => {
      if (on === listening) return;
      listening = on;
      if (on) {
        window.addEventListener("scroll", schedule, { passive: true });
        window.addEventListener("resize", schedule);
        if (observer && layoutRef?.current) observer.observe(layoutRef.current);
      } else {
        window.removeEventListener("scroll", schedule);
        window.removeEventListener("resize", schedule);
        observer?.disconnect();
      }
    };
    const sync = () => {
      listen(mq.matches);
      write();
    };

    sync();
    mq.addEventListener?.("change", sync);
    return () => {
      mq.removeEventListener?.("change", sync);
      listen(false);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [railRef, layoutRef]);
}
