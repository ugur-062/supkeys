"use client";

import { cn } from "@/lib/utils";
import { Package, type LucideIcon } from "lucide-react";
import { useState } from "react";

/**
 * KÜÇÜK RESİM — tek bileşen (v2 denetimi, 2026-09-03).
 *
 * Aynı şey dört yerde dört biçimde çiziliyordu: Ürün Ara'da bomboş beyaz alan,
 * Ürünlerim'de gri kutu ikonu, keşif kartında kategori ampulü, profilde çıplak
 * <img>. Kural: görsel varsa görsel; yoksa veya yüklenemezse AÇIK GRİ ZEMİN +
 * ikon. Beyaz boş kutu hiçbir yerde kalmaz.
 *
 * Boyut ve oran prop'la; `fallbackIcon` içerik türünü söyler (ürün: kutu,
 * firma: bina). Süsleme yok — küçük resim listeyi tarar, sayfayı taşımaz.
 */
export function Thumb({
  src,
  alt = "",
  size = "md",
  ratio = "1:1",
  fallbackIcon: Icon = Package,
  className,
}: {
  src?: string | null;
  alt?: string;
  size?: "sm" | "md" | "lg";
  ratio?: "1:1" | "4:3";
  fallbackIcon?: LucideIcon;
  className?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const ok = !!src && failed !== src;
  const dims =
    ratio === "4:3"
      ? { sm: "h-10 w-[3.33rem]", md: "h-12 w-16", lg: "h-16 w-[5.33rem]" }[size]
      : { sm: "size-10", md: "size-12", lg: "size-16" }[size];
  const icon = { sm: "size-4", md: "size-5", lg: "size-6" }[size];

  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-zinc-100 ring-1 ring-zinc-950/5",
        dims,
        className,
      )}
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
    >
      {ok ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src!}
          alt=""
          loading="lazy"
          className="size-full object-cover"
          onError={() => setFailed(src!)}
        />
      ) : (
        <Icon aria-hidden className={cn("text-zinc-400", icon)} />
      )}
    </span>
  );
}
