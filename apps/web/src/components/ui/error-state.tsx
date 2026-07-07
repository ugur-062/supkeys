"use client";

import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

/**
 * Paylaşılan hata durumu — liste/sayfa sorgusu başarısız olduğunda "kayıt yok"
 * yerine bunu göster. `onRetry` verilirse tekrar-dene düğmesi çıkar (query
 * refetch veya error boundary reset).
 */
export function ErrorState({
  title = "Bir şeyler ters gitti",
  message = "İçerik yüklenirken bir hata oluştu. Lütfen tekrar deneyin.",
  onRetry,
  retryLabel = "Tekrar dene",
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-zinc-950/10 bg-white px-6 py-12 text-center" +
        (className ? ` ${className}` : "")
      }
    >
      <AlertTriangle className="size-8 text-red-500" aria-hidden="true" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-zinc-900">{title}</p>
        <p className="max-w-sm text-sm text-zinc-500">{message}</p>
      </div>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
