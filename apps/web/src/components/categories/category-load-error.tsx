"use client";

import { AlertTriangle } from "lucide-react";

interface LoadErrorProps {
  message: string;
  retryLabel: string;
  onRetry: () => void;
  /** Ağaç dalının içinde tek satır; değilse listenin ortasında blok. */
  compact?: boolean;
}

/**
 * YÜKLEME HATASI — "sonuç yok" ya da boş dal DEĞİL (kök kural: boş durum yalnız
 * başarılı ve boş yanıtta). Her zaman "Yeniden dene" taşır.
 */
export function LoadError({ message, retryLabel, onRetry, compact }: LoadErrorProps) {
  const retry = (
    <button
      type="button"
      onClick={onRetry}
      className="inline-flex min-h-8 items-center rounded-md px-2 text-xs font-semibold text-zinc-900 underline underline-offset-2 hover:bg-zinc-100"
    >
      {retryLabel}
    </button>
  );
  if (compact) {
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1 text-xs text-zinc-700"
      >
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-500" aria-hidden />
        <span className="min-w-0">{message}</span>
        {retry}
      </div>
    );
  }
  return (
    <div role="alert" className="flex flex-col items-center gap-2 py-10 text-center">
      <AlertTriangle className="size-7 text-red-500" aria-hidden />
      <p className="max-w-sm text-sm font-medium text-zinc-700">{message}</p>
      {retry}
    </div>
  );
}
