"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

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
 */
export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  variant = "card",
}: PaginationProps) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const pages = pageRange(page, totalPages);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3",
        variant === "card"
          ? "border-t border-zinc-950/5 bg-white px-4 py-3"
          : "pt-4",
      )}
    >
      <div className="text-sm text-zinc-500">
        {total === 0
          ? "Kayıt yok"
          : `${total} kayıt içinden ${start}-${end} arası`}
      </div>

      <nav className="flex items-center gap-1" aria-label="Sayfalama">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Önceki sayfa"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        {pages.map((p, i) =>
          p === "…" ? (
            <span
              key={`gap-${i}`}
              className="px-1.5 text-sm text-zinc-400 select-none"
            >
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p)}
              aria-current={p === page ? "page" : undefined}
              className={cn(
                "inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-sm font-medium tabular-nums transition-colors",
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
          variant="ghost"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Sonraki sayfa"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </nav>
    </div>
  );
}
