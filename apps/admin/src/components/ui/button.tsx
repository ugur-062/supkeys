"use client";

import { Button as CatalystButton } from "@/components/catalyst/button";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type MouseEvent,
  type Ref,
} from "react";

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
 *
 * Tek uçuş (arayüz testi FX-00 O-045): `onClick` promise dönerse düğme o
 * çözülene dek senkron kilitlidir — çift tık ikinci isteği atmaz. Senkron
 * işleyiciler etkilenmez.
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
    onClick,
    ...props
  },
  ref,
) {
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const handleClick = onClick
    ? (e: MouseEvent<HTMLButtonElement>) => {
        if (inFlight.current) {
          e.preventDefault();
          return;
        }
        const result = onClick(e) as unknown;
        if (result && typeof (result as PromiseLike<unknown>).then === "function") {
          inFlight.current = true;
          setBusy(true);
          const release = () => {
            inFlight.current = false;
            if (mounted.current) setBusy(false);
          };
          (result as PromiseLike<unknown>).then(release, release);
        }
      }
    : undefined;

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
      disabled={disabled || loading || busy}
      onClick={handleClick}
      className={cn(fullWidth && "w-full", className)}
      {...styleProps}
      {...props}
    >
      {loading ? <Loader2 data-slot="icon" className="animate-spin" /> : null}
      {children}
    </CatalystButton>
  );
});
