"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface Props {
  title: string;
  /** Başlık altı açıklama. Tek satır metin veya zengin içerik. */
  description?: ReactNode;
  /** Sağ üstte hizalanan aksiyon(lar) — buton vb. */
  action?: ReactNode;
  className?: string;
}

/**
 * Alıcı paneli sayfa başlığı standardı.
 * Başlık `text-2xl sm:text-3xl`, açıklama `text-sm text-slate-500`,
 * aksiyon slotu sağda. Tüm liste/sayfa başlıkları bunu kullanır.
 */
export function PageHeader({ title, description, action, className }: Props) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-4",
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        <h1 className="font-display text-2xl font-bold leading-tight text-brand-900 sm:text-3xl">
          {title}
        </h1>
        {description ? (
          <p className="text-sm text-slate-500">{description}</p>
        ) : null}
      </div>
      {action ? <div className="flex-shrink-0">{action}</div> : null}
    </div>
  );
}
