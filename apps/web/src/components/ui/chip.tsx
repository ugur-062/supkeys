"use client";

import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * ÇİP — seçilebilir/kaldırılabilir küçük etiket (süzgeç çipleri, popüler
 * kategoriler, anahtar kelimeler). h-8, tam yuvarlak, kenarlı. Seçili = siyah
 * dolgu (monokrom). `href` verilirse bağlantı (botlar izler), yoksa buton.
 * `count` tabular-nums ile soluk; `onRemove` × düğmesi ayrı bir odak hedefi.
 */
export function Chip({
  children,
  selected = false,
  count,
  href,
  onClick,
  onRemove,
  removeLabel,
  className,
  disabled,
}: {
  children: ReactNode;
  selected?: boolean;
  count?: number;
  href?: string;
  onClick?: () => void;
  onRemove?: () => void;
  /** Ekran okuyucu için "× {ad}" etiketi. */
  removeLabel?: string;
  className?: string;
  disabled?: boolean;
}) {
  const base = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition",
    selected
      ? "border-zinc-950 bg-zinc-950 text-white"
      : "border-zinc-300 bg-white text-zinc-800 hover:border-zinc-500",
    disabled && "pointer-events-none opacity-40",
    className,
  );
  const inner = (
    <>
      <span className="truncate">{children}</span>
      {count != null ? (
        <span className={cn("tnum text-xs", selected ? "text-zinc-300" : "text-zinc-500")}>{count}</span>
      ) : null}
    </>
  );
  if (onRemove) {
    return (
      <span className={base}>
        {inner}
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel ?? "Kaldır"}
          className={cn(
            "-mr-1.5 flex size-5 items-center justify-center rounded-full",
            selected ? "hover:bg-white/15" : "hover:bg-zinc-100",
          )}
        >
          <X aria-hidden className="size-3.5" />
        </button>
      </span>
    );
  }
  if (href) {
    return (
      <Link href={href} className={base} aria-current={selected ? "true" : undefined}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} aria-pressed={selected} disabled={disabled} className={base}>
      {inner}
    </button>
  );
}
