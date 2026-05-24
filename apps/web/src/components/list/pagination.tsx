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
   * "card" — kart'ın alt kenarına oturur (border-t + bg-white); tablo-içi-kart
   *   listeleri için (varsayılan).
   * "bare" — bordür/arka plan yok, sadece üst boşluk; kart-grid listeleri için.
   */
  variant?: "card" | "bare";
}

/**
 * Liste sayfalama çubuğu — kayıt aralığı + Önceki/Sonraki + sayfa göstergesi.
 * Tek sayfada butonlar disabled olur.
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

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3",
        variant === "card"
          ? "px-4 py-3 border-t border-surface-border bg-white"
          : "pt-4",
      )}
    >
      <div className="text-sm text-slate-500">
        {total === 0
          ? "Kayıt yok"
          : `${total} kayıt içinden ${start}-${end} arası`}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          <ChevronLeft className="w-4 h-4" />
          Önceki
        </Button>
        <span className="text-sm text-slate-500 px-2 tabular-nums">
          {totalPages === 0 ? "—" : `Sayfa ${page} / ${totalPages}`}
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
        >
          Sonraki
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
