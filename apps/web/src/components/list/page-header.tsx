"use client";

import { Heading } from "@/components/catalyst/heading";
import { Text } from "@/components/catalyst/text";
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
 * Sayfa başlığı standardı — Catalyst Heading + Text.
 * Tüm liste/sayfa başlıkları bunu kullanır.
 */
export function PageHeader({ title, description, action, className }: Props) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-4",
        className,
      )}
    >
      <div className="min-w-0">
        <Heading>{title}</Heading>
        {description ? (
          <Text className="mt-1 text-sm leading-6 text-slate-500">
            {description}
          </Text>
        ) : null}
      </div>
      {action ? <div className="flex-shrink-0">{action}</div> : null}
    </div>
  );
}
