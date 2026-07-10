"use client";

import { TableCell, TableRow } from "@/components/catalyst/table";
import { Button } from "@/components/ui/button";

/**
 * Tablo durum satırı — TEK desen: yüklenirken skeleton satırlar (erişilebilir
 * "Yükleniyor..." metniyle), hatada tekrar-dene, boşta sayfaya özgü mesaj.
 * 12 sayfada elle yazılmış "Yükleniyor... / bulunamadı" hücrelerinin yerine.
 */
export function TableStateRow({
  colSpan,
  loading,
  error,
  empty,
  onRetry,
}: {
  colSpan: number;
  loading?: boolean;
  error?: boolean;
  /** Boş durum mesajı — sayfaya özgü ("Firma bulunamadı" vb.). */
  empty: string;
  onRetry?: () => void;
}) {
  if (loading) {
    return (
      <>
        <TableRow>
          <TableCell colSpan={colSpan}>
            <span className="sr-only">Yükleniyor...</span>
            <div className="animate-pulse space-y-2 py-2" aria-hidden>
              <div className="h-3 w-3/4 rounded bg-zinc-100" />
              <div className="h-3 w-1/2 rounded bg-zinc-100" />
            </div>
          </TableCell>
        </TableRow>
        {[0, 1].map((i) => (
          <TableRow key={i}>
            <TableCell colSpan={colSpan}>
              <div className="animate-pulse space-y-2 py-2" aria-hidden>
                <div className="h-3 w-2/3 rounded bg-zinc-100" />
                <div className="h-3 w-2/5 rounded bg-zinc-100" />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </>
    );
  }
  return (
    <TableRow>
      <TableCell
        colSpan={colSpan}
        className="text-admin-text-muted py-10 text-center"
      >
        {error ? (
          <span className="inline-flex flex-col items-center gap-2">
            <span>Veri alınamadı — lütfen tekrar deneyin</span>
            {onRetry ? (
              <Button variant="secondary" size="sm" onClick={onRetry}>
                Tekrar dene
              </Button>
            ) : null}
          </span>
        ) : (
          empty
        )}
      </TableCell>
    </TableRow>
  );
}
