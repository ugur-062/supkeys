"use client";

import { Button as CatalystButton } from "@/components/catalyst/button";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode, type Ref } from "react";

type Variant = "primary" | "secondary" | "ghost" | "link" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
  /** Verilirse bağlantı olarak çizilir (Catalyst `href` → Next Link); `asChild` yerine. */
  href?: string;
  /** Metnin solunda/sağında ikon — Catalyst `data-slot="icon"` boyutlar. */
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
}

/**
 * Uygulama genelindeki Button — artık Catalyst Button'ı sarar (siyah/dark-zinc
 * primary, outline secondary, plain ghost). Eski API (variant/size/loading/
 * fullWidth) korunur; çağrı yerleri değişmeden Catalyst görünür.
 * PROMPT 2 (2026-09-06): `link` (alt çizgili metin düğmesi), `danger` (Catalyst
 * kırmızı), `iconLeft/iconRight` ve `href` eklendi — palet monokrom kalır.
 * Not: `size` Catalyst'in tutarlı boyutuna eşlenir (Catalyst tasarımı).
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size: _size,
    loading,
    fullWidth,
    href,
    iconLeft,
    iconRight,
    className,
    children,
    disabled,
    type,
    // `color` HTMLButtonAttributes'ta (deprecated) var; Catalyst union'ıyla
    // çakışır — ayıkla.
    color: _color,
    ...props
  },
  ref,
) {
  const styleProps =
    variant === "secondary"
      ? ({ outline: true } as const)
      : variant === "ghost" || variant === "link"
        ? ({ plain: true } as const)
        : variant === "danger"
          ? ({ color: "red" } as const)
          : {};

  return (
    <CatalystButton
      ref={ref as Ref<HTMLElement>}
      // Eski native <button> varsayılanı submit idi — davranışı koru.
      type={type ?? "submit"}
      disabled={disabled || loading}
      // Outline (secondary) Catalyst'te şeffaf zeminli — gri sayfa zemininde
      // arka plana karışıyordu; beyaz zemin tuşu her yüzeyde ayrıştırır.
      className={cn(
        variant === "secondary" && "bg-white",
        variant === "link" && "px-0 underline underline-offset-4 hover:bg-transparent",
        fullWidth && "w-full",
        className,
      )}
      {...styleProps}
      {...(href ? { href } : {})}
      {...(props as Record<string, unknown>)}
    >
      {loading ? <Loader2 data-slot="icon" className="animate-spin" /> : iconLeft}
      {children}
      {iconRight}
    </CatalystButton>
  );
});
