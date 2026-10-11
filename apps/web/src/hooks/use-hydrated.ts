"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/**
 * Hidrasyon tamamlandı mı? SSR'da ve istemcinin hidrasyon geçişinde `false`,
 * hemen ardından `true` (React sunucu anlık görüntüsünü hidrasyonda kullanır).
 *
 * "Şimdi"ye bağlı metinler (kalan gün, "Yeni" rozeti) ISR ile önbelleğe
 * alınan sayfalarda render anındaki saatle hesaplanırsa, gece yarısından önce
 * üretilen HTML sonradan servis edildiğinde istemci bir gün farklı sayar ve
 * React #418 atar (derin denetim X13). Bu değerleri `hydrated` iken çizin.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
