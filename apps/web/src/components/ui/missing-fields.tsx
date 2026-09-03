"use client";

import { cn } from "@/lib/utils";

/**
 * EKSİK ALAN LİSTESİ — tek bileşen (2026-09-03).
 *
 * Profilim'deki "Eksik: Hakkında · Sektör", ürün formundaki "puanını
 * artırmak için" listesi ve panodaki profil sağlığı kartı aynı şeyi üç ayrı
 * biçimde çiziyordu. Tek biçim: etiket + çipler; `max` ile kırpılır ("+3").
 * Boşsa hiçbir şey çizmez — "tüm alanlar dolu" satırını çağıran karar verir.
 */
export function MissingFields({
  items,
  label = "Eksik",
  max,
  className,
}: {
  items: string[];
  /** Çiplerin önündeki etiket ("Eksik", "Puanını artırmak için"). */
  label?: string;
  /** En fazla bu kadar çip; kalan "+N" olarak. */
  max?: number;
  className?: string;
}) {
  if (items.length === 0) return null;
  const shown = max ? items.slice(0, max) : items;
  const rest = items.length - shown.length;
  return (
    <p className={cn("flex flex-wrap items-center gap-1.5 text-xs text-zinc-500", className)}>
      <span className="font-medium text-zinc-600">{label}:</span>
      {shown.map((item) => (
        <span
          key={item}
          className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-700"
        >
          {item}
        </span>
      ))}
      {rest > 0 ? <span className="text-zinc-400">+{rest}</span> : null}
    </p>
  );
}
