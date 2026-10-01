"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef } from "react";

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
  // Sayfa toplam sayfayı aşabilir: moderasyon kuyruğunda onay/red son sayfayı
  // boşaltır ya da URL'deki eski `page` yeni filtrede yoktur. Kırpılmadan
  // "25 kayıt içinden 26-25 arası" + boş tablo çıkıyordu (derin denetim LU-13).
  // Görünüm kırpılmış sayfayla hesaplanır, çağırana da son sayfaya dönmesi
  // bildirilir. `total > 0` şartı: yükleme sırasındaki geçici 0 toplamda
  // sayfayı sıfırlamasın.
  const overflow = total > 0 && totalPages >= 1 && page > totalPages;
  const current = overflow ? totalPages : page;
  const clampedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!overflow) {
      clampedFor.current = null;
      return;
    }
    // URL tabanlı çağıranlarda `page` gecikmeli güncellenir — aynı düzeltmeyi
    // her render'da tekrar istemeyelim.
    const key = `${page}/${totalPages}`;
    if (clampedFor.current === key) return;
    clampedFor.current = key;
    onPageChange(totalPages);
  }, [overflow, page, totalPages, onPageChange]);

  // Kayıt yoksa sayfalayıcı çizilmez: tablonun boş durumu tek mesajdır
  // ("Kayıt bulunamadı" + "Kayıt yok" + tek "1" düğmesi — arayüz testi D-145).
  if (total === 0) return null;

  const start = (current - 1) * pageSize + 1;
  const end = Math.min(current * pageSize, total);
  const pages = pageRange(current, totalPages);

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
        {`${total} kayıt içinden ${start}-${end} arası`}
      </div>

      <nav className="flex items-center gap-1" aria-label="Sayfalama">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onPageChange(current - 1)}
          disabled={current <= 1}
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
              aria-current={p === current ? "page" : undefined}
              className={cn(
                "inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-sm font-medium tabular-nums transition-colors",
                p === current
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
          onClick={() => onPageChange(current + 1)}
          disabled={current >= totalPages}
          aria-label="Sonraki sayfa"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </nav>
    </div>
  );
}
