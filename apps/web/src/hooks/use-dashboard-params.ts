"use client";

import { useSearchParams } from "next/navigation";
import { useCallback } from "react";

/**
 * Pano URL durumu (Faz 3) — dönem + sekme + karşılaştır + özel aralık TEK
 * doğruluk kaynağı olarak URL search param'larında yaşar:
 *   ?period=month|quarter|custom  (year = varsayılan, param yazılmaz)
 *   &from=YYYY-MM-DD&to=YYYY-MM-DD  (yalnız period=custom)
 *   &tab=...    (varsayılan sekme param yazılmaz)
 * Sayfa paylaşılabilir/yer imlenebilir; geçişler history'e PUSH edilir ki
 * geri tuşu çalışsın.
 *
 * YAZIM YERLİ `history.pushState` İLE (mobil denetim g10-02, 2026-10-15):
 * `router.push(…, { scroll: false })` sekme / dönem dokunuşunda sayfayı yine
 * EN ÜSTE atıyordu — Next'in `ScrollAndFocusHandler`ı gezinme sonrası
 * `scrollTop = 0` yapıp sayfa kökünü odaklıyor; telefonda Grafikler ~2000 px
 * aşağıda, kullanıcı her dokunuşta geri kaydırmak zorundaydı. Yerli
 * `pushState`i Next 15 `useSearchParams` ile eşitler (sunucu isteği yok,
 * kaydırma yok, Geri tuşu çalışır); dil öneki `window.location`dan korunur.
 */

export type DashPeriod = "month" | "quarter" | "year" | "custom";

export interface DashboardParams {
  period: DashPeriod;
  /** Özel aralık (period=custom iken dolu) — YYYY-MM-DD. */
  from: string | null;
  to: string | null;
  tab: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidRange(from: string | null, to: string | null): boolean {
  return (
    !!from && !!to && DATE_RE.test(from) && DATE_RE.test(to) && from <= to
  );
}

export function useDashboardParams(
  defaultTab: string,
  validTabs: readonly string[],
): DashboardParams & {
  setParams: (patch: Partial<DashboardParams>) => void;
} {
  const sp = useSearchParams();

  const rawPeriod = sp.get("period");
  const from = sp.get("from");
  const to = sp.get("to");
  // Geçersiz custom (eksik/bozuk tarih) sessizce yıla düşer — kart matematiği
  // asla yarım aralıkla çalışmaz.
  const period: DashPeriod =
    rawPeriod === "month" || rawPeriod === "quarter"
      ? rawPeriod
      : rawPeriod === "custom" && isValidRange(from, to)
        ? "custom"
        : "year";
  const rawTab = sp.get("tab");
  const tab = rawTab && validTabs.includes(rawTab) ? rawTab : defaultTab;

  // Taban HER ZAMAN `window.location.search`: `pushState` adresi eşzamanlı
  // günceller → ardışık hızlı değişimde (dönem + sekme) ikinci çağrı ilkinin
  // parametresini düşürmez (eski `router.push` yarışı için tutulan bekleyen
  // sorgu ref'i gereksiz kaldı).
  const setParams = useCallback(
    (patch: Partial<DashboardParams>) => {
      const cur = new URLSearchParams(window.location.search);
      const next = new URLSearchParams(cur.toString());
      const curRawPeriod = cur.get("period");
      const curPeriod: DashPeriod =
        curRawPeriod === "month" || curRawPeriod === "quarter"
          ? curRawPeriod
          : curRawPeriod === "custom" && isValidRange(cur.get("from"), cur.get("to"))
            ? "custom"
            : "year";

      const p = patch.period ?? curPeriod;
      if (p === "year") next.delete("period");
      else next.set("period", p);

      const nf = patch.from !== undefined ? patch.from : cur.get("from");
      const nt = patch.to !== undefined ? patch.to : cur.get("to");
      if (p === "custom" && isValidRange(nf, nt)) {
        next.set("from", nf!);
        next.set("to", nt!);
      } else {
        next.delete("from");
        next.delete("to");
      }

      const curTab = cur.get("tab");
      const t =
        patch.tab ??
        (curTab && validTabs.includes(curTab) ? curTab : defaultTab);
      if (t === defaultTab) next.delete("tab");
      else next.set("tab", t);

      const qs = next.toString();
      const url = new URL(window.location.href);
      url.search = qs ? `?${qs}` : "";
      // Aynı adres yeniden yazılmaz (seçili sekmeye / döneme tekrar dokunma
      // geçmişe boş kayıt eklemesin).
      if (url.href === window.location.href) return;
      window.history.pushState(null, "", url.href);
    },
    [validTabs, defaultTab],
  );

  return {
    period,
    from: period === "custom" ? from : null,
    to: period === "custom" ? to : null,
    tab,
    setParams,
  };
}
