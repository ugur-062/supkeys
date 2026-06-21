"use client";

import { Input as CatalystInput } from "@/components/catalyst/input";
import { forwardRef, type InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
}

/**
 * Uygulama geneli Input — Catalyst Input'u sarar. Eski `hasError` → Catalyst
 * `invalid`. Diğer tüm input prop'ları aynen geçer.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { hasError, ...props },
  ref,
) {
  return <CatalystInput ref={ref} invalid={hasError || undefined} {...props} />;
});
