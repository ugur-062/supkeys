"use client";

import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";

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
  title,
  message,
  onRetry,
  retryLabel,
  className,
}: ErrorStateProps) {
  // Varsayılan metinler GÖVDEDE çözülür: parametre varsayılanı `t`yi göremez.
  const t = useTranslations("web.shared.errorState");
  const heading = title ?? t("birSeylerTersGitti");
  const body = message ?? t("icerikYuklenirkenHata");
  const retry = retryLabel ?? t("tekrarDene");
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
        <p className="text-sm font-medium text-zinc-900">{heading}</p>
        <p className="max-w-sm text-sm text-zinc-500">{body}</p>
      </div>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {retry}
        </Button>
      ) : null}
    </div>
  );
}
