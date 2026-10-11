"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";

/**
 * Sorgu hatası 404 mü? Var olmayan kayıtta "Tekrar dene" işe yaramaz —
 * detay sayfaları bu durumda {@link NotFoundState} çizer (arayüz testi
 * D-206, D-215).
 */
export function isNotFoundError(error: unknown): boolean {
  return (
    (error as { response?: { status?: number } } | null | undefined)?.response
      ?.status === 404
  );
}

/** Detay sayfası "kayıt bulunamadı" durumu — yeniden deneme yok, geri bağlantı var. */
export function NotFoundState({
  title,
  message,
  backHref,
  backLabel,
}: {
  title: string;
  message: string;
  backHref: string;
  backLabel: string;
}) {
  return (
    <div className="space-y-4 py-16 text-center">
      <p className="text-admin-text text-sm font-medium">{title}</p>
      <p className="text-admin-text-muted text-sm">{message}</p>
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> {backLabel}
      </Link>
    </div>
  );
}
