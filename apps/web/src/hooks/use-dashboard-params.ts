"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

/**
 * Pano URL durumu (Faz 3) — dönem + sekme + karşılaştır + özel aralık TEK
 * doğruluk kaynağı olarak URL search param'larında yaşar:
 *   ?period=month|quarter|custom  (year = varsayılan, param yazılmaz)
 *   &from=YYYY-MM-DD&to=YYYY-MM-DD  (yalnız period=custom)
 *   &tab=...    (varsayılan sekme param yazılmaz)
 * Sayfa paylaşılabilir/yer imlenebilir; geçişler history'e PUSH edilir ki
 * geri tuşu çalışsın.
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
  const router = useRouter();
  const pathname = usePathname();
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

  // Ardışık hızlı değişim yarışı (karşılaştır + dönem): router.push async —
  // ikinci setParams, ilk push henüz URL'e yansımadan gelirse bayat taban
  // bir önceki parametreyi sessizce düşürür. Son push'lanan sorgu ref'te
  // aynalanır; URL güncellenince (sp değişince) ref sıfırlanır.
  const pendingQs = useRef<string | null>(null);
  useEffect(() => {
    pendingQs.current = null;
  }, [sp]);

  const setParams = useCallback(
    (patch: Partial<DashboardParams>) => {
      const cur = new URLSearchParams(
        pendingQs.current ?? window.location.search,
      );
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
      pendingQs.current = qs;
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [validTabs, defaultTab, pathname, router],
  );

  return {
    period,
    from: period === "custom" ? from : null,
    to: period === "custom" ? to : null,
    tab,
    setParams,
  };
}
