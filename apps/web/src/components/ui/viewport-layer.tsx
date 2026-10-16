"use client";

import { createPortal } from "react-dom";
import type { ReactNode } from "react";

import { useHydrated } from "@/hooks/use-hydrated";

/**
 * GÖRÜNÜM ALANI KATMANI — sayfa içeriğindeki `position: fixed` öğeyi (alt
 * yapışkan çubuk, köşe düğmesi) `document.body`ye taşır; öğe her motorda
 * görünüm alanına göre konumlanır (mobil kabuk, Android öykünücüsü /
 * WebView 124).
 *
 * NEDEN: panelin `<main>`i `@container/panel`, herkese açık `<main>`
 * `@container` (`container-type: inline-size`). Eski motorlar (Chrome /
 * Android WebView ~128 öncesi, eski Safari / WKWebView) kapsayıcıya YERLEŞİM
 * KAPSAMASI da uygular ve yerleşim kapsaması öğeyi `fixed` torunlarının
 * İÇERİK BLOĞU yapar: `<main>` içindeki her `fixed` öğe görünüm alanına değil
 * `<main>`e göre konumlanıyordu (yeni talep formunun mobil "Yayınla" çubuğu
 * ekranın altında değil formun SONUNDA, top 5268 px). Yeni Chromium
 * (Playwright) bunu yapmadığı için tarayıcı testleri yeşildi. `body`
 * kapsayıcı değildir. Kural: sayfa içeriğinde (`<main>` altında) çizilen
 * portalsız her `fixed` öğe bu katmandan geçer. Pencere / çekmece / menü
 * zaten portaldan (Headless UI `body`ye taşır), AI düğmesi `<main>`in dışında.
 *
 * - SSR'da ve hidrasyon geçişinde HİÇBİR ŞEY çizilmez; portal hidrasyonun
 *   hemen ardından kurulur (`useHydrated`). Sunucuda `document` yok; yerinde
 *   çizip sonra taşımak alt ağacı yeniden bağlardı (durum ve ref'ler sıfırlanır)
 *   ve eski motorda öğe bir kare yanlış yerde görünürdü. Hidrasyondan sonra
 *   bağlanan katman (istemci gezinmesi, veri gelince çizilen form, kirlenince
 *   çıkan çubuk) ilk çizimde portaldadır. Hidrasyon yolunda öğe bir çizim
 *   SONRA gelir: öğeyi ölçen efekt `[]` ile değil öğenin kendisine bağlanır
 *   (geri çağırımlı ref; bkz. `FloatingRequestDock`).
 * - React bağlamı (çeviri, düğme rengi, form durumu) ve React olayları korunur
 *   (portal olayı React ağacında yukarı kabarır). DOM'da öğe `body`nin
 *   SONUNDADIR: `<form>` içinde kalan `type="submit"` düğmesi forma
 *   `form="<id>"` ile bağlanır; yerel dinleyici `main` / sayfa kabında değil
 *   `document`te olmalı (AI düğmesi alt çubukları `document`ten bulur,
 *   `html:has([data-sticky-cta])` belgenin tamamına bakar); kabuktan miras
 *   stil yoktur (renk / yazı sınıfları öğenin üstünde); Sekme sırasında sayfa
 *   sonuna gelir.
 * - Katman sırası aynı: yeni motorda `<main>` katman bağlamı kurmuyordu, öğe
 *   zaten kök bağlamdaydı (alt çubuk z-20 < AI düğmesi z-40 < pencere z-50).
 */
export function ViewportLayer({ children }: { children: ReactNode }) {
  const hydrated = useHydrated();
  return hydrated ? createPortal(children, document.body) : null;
}
