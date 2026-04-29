"use client";

import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
}: PaginationProps) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-admin-border bg-admin-surface">
      <div className="text-sm text-admin-text-muted">
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
        <span className="text-sm text-admin-text-muted px-2 tabular-nums">
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
