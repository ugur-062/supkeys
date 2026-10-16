"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { MouseEvent } from "react";
import { scrollToListStart } from "./scroll-to-list-start";
import { FAB_CLEARANCE_SM_CLASS } from "@/components/company-shell/assistant/fab-clearance";

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  /**
   * "card" — kart'ın alt kenarına oturur (border-t + bg-white).
   * "bare" — bordür/arka plan yok, sadece üst boşluk.
   */
  variant?: "card" | "bare";
}

// 1 … 4 5 6 … 12 şeklinde kısaltılmış sayfa aralığı
function pageRange(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);
  if (left > 2) out.push("…");
  for (let i = left; i <= right; i++) out.push(i);
  if (right < total - 1) out.push("…");
  out.push(total);
  return out;
}

/**
 * Catalyst tarzı numaralı liste sayfalama — kayıt aralığı + Önceki/Sonraki +
 * sayfa numaraları (aktif sayfa siyah).
 *
 * MOBİL (mobil denetim 2026-10): sayfa değişince görünüm listenin başına
 * döner (`scrollToListStart`; eskiden kullanıcı yeni sayfanın SONUNDA
 * kalıyordu). Telefonda numaralar ve boşluklar daralır — 360 px'te
 * "1 … 101 102 103 … 200" bile 328 px'lik içeriğe sığar; numaraların dokunma
 * alanı görünmez bir katmanla 44 px yüksekliğe çıkar (yan yana numaralar
 * çakışmasın diye yalnız dikeyde). `sm` ve üstü değişmedi.
 *
 * AI ASİSTAN PAYI (mobil denetim 2026-10, yalnız sm+): liste sonunda
 * "Sonraki sayfa" (1280'de 1200-1240) sağ-alttaki düğmenin altında kalıyor,
 * düğme listelerin sonunda çekiliyordu → sağda `FAB_CLEARANCE_SM_CLASS`;
 * ikisi de görünür ve tıklanır. Telefon yerleşimi değişmez.
 */
export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  variant = "card",
}: PaginationProps) {
  const t = useTranslations("web.panel.shell.pagination");
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const pages = pageRange(page, totalPages);

  const go = (p: number, e: MouseEvent<HTMLElement>) => {
    if (p === page) return;
    // Konum ESKİ düzende ölçülür ve hemen kaydırılır: liste başının yeri
    // sayfa değişiminden etkilenmez, ama yeni sayfa yüklenirken liste
    // iskelete dönüp sayfalama DOM'dan kalkabilir.
    scrollToListStart(e.currentTarget);
    onPageChange(p);
  };

  return (
    <div
      data-pagination-root=""
      className={cn(
        "flex flex-wrap items-center justify-between gap-3",
        variant === "card"
          ? "border-t border-zinc-950/5 bg-white px-4 py-3"
          : "pt-4",
        FAB_CLEARANCE_SM_CLASS,
      )}
    >
      <div className="text-sm text-zinc-500">
        {total === 0
          ? t("kayitYok")
          : t("kayitIcindenArasi", { total: total, start: start, end: end })}
      </div>

      {/* `flex-wrap` yalnız son çare: bugünkü ölçülerle 320 px'te bile tek
          satıra sığar, sığmazsa sayfa yatay kaymaz, numaralar alt satıra iner. */}
      <nav className="flex flex-wrap items-center gap-0.5 sm:gap-1" aria-label={t("sayfalama")}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={(e) => go(page - 1, e)}
          disabled={page <= 1}
          aria-label={t("oncekiSayfa")}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        {pages.map((p, i) =>
          p === "…" ? (
            <span
              key={`gap-${i}`}
              className="px-0.5 text-sm text-zinc-400 select-none sm:px-1.5"
            >
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={(e) => go(p, e)}
              aria-current={p === page ? "page" : undefined}
              className={cn(
                "relative inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-1 text-sm font-medium tabular-nums transition-colors sm:px-2",
                // Görünmez dokunma alanı: 32 → 44 px yükseklik, genişlik aynı.
                "after:absolute after:inset-x-0 after:-inset-y-1.5",
                p === page
                  ? "bg-zinc-900 text-white"
                  : "text-zinc-700 hover:bg-zinc-100",
              )}
            >
              {p}
            </button>
          ),
        )}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={(e) => go(page + 1, e)}
          disabled={page >= totalPages}
          aria-label={t("sonrakiSayfa")}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </nav>
    </div>
  );
}
