"use client";

import { Button as CatalystButton } from "@/components/catalyst/button";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type Ref } from "react";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
}

/**
 * Uygulama genelindeki Button — artık Catalyst Button'ı sarar (siyah/dark-zinc
 * primary, outline secondary, plain ghost). Eski API (variant/size/loading/
 * fullWidth) korunur; çağrı yerleri değişmeden Catalyst görünür.
 * Not: `size` Catalyst'in tutarlı boyutuna eşlenir (Catalyst tasarımı).
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size: _size,
    loading,
    fullWidth,
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
      : variant === "ghost"
        ? ({ plain: true } as const)
        : {};

  return (
    <CatalystButton
      ref={ref as Ref<HTMLElement>}
      // Eski native <button> varsayılanı submit idi — davranışı koru.
      type={type ?? "submit"}
      disabled={disabled || loading}
      // Outline (secondary) Catalyst'te şeffaf zeminli — gri sayfa zemininde
      // arka plana karışıyordu; beyaz zemin tuşu her yüzeyde ayrıştırır.
      className={cn(variant === "secondary" && "bg-white", fullWidth && "w-full", className)}
      {...styleProps}
      {...props}
    >
      {loading ? <Loader2 data-slot="icon" className="animate-spin" /> : null}
      {children}
    </CatalystButton>
  );
});
