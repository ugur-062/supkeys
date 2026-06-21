"use client";

import { Button as CatalystButton } from "@/components/catalyst/button";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type Ref } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
}

/**
 * Admin geneli Button — Catalyst Button'ı sarar (siyah/dark-zinc primary,
 * outline secondary, plain ghost, red danger). Eski API (variant/size/loading/
 * fullWidth) korunur; çağrı yerleri değişmeden Catalyst görünür.
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
        : variant === "danger"
          ? ({ color: "red" } as const)
          : {};

  return (
    <CatalystButton
      ref={ref as Ref<HTMLElement>}
      type={type ?? "submit"}
      disabled={disabled || loading}
      className={cn(fullWidth && "w-full", className)}
      {...styleProps}
      {...props}
    >
      {loading ? <Loader2 data-slot="icon" className="animate-spin" /> : null}
      {children}
    </CatalystButton>
  );
});
