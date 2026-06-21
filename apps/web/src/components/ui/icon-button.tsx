"use client";

import { cn } from "@/lib/utils";
import { forwardRef, type ButtonHTMLAttributes } from "react";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** "danger" → hover'da kırmızı (sil vb.). */
  tone?: "default" | "danger";
}

/**
 * Tailwind Plus / Catalyst ikon-buton deseni (zinc ghost). Catalyst ayrı bir
 * ikon-buton bileşeni sunmadığı için ortak kullanım burada tanımlanır —
 * düzenle / sil / kapat gibi tek-ikon aksiyonlarında kullanılır.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton({ tone = "default", className, type, ...props }, ref) {
    return (
      <button
        ref={ref}
        type={type ?? "button"}
        className={cn(
          "inline-flex items-center justify-center rounded-md p-1.5 text-zinc-400 transition-colors",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950/20",
          "disabled:cursor-not-allowed disabled:opacity-40",
          tone === "danger"
            ? "hover:bg-red-50 hover:text-red-600"
            : "hover:bg-zinc-100 hover:text-zinc-700",
          className,
        )}
        {...props}
      />
    );
  },
);
