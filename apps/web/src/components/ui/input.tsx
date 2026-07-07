"use client";

import { Input as CatalystInput } from "@/components/catalyst/input";
import { useFieldContext } from "@/components/ui/field";
import { forwardRef, type InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
}

/**
 * Uygulama geneli Input — Catalyst Input'u sarar. `hasError` → Catalyst
 * `invalid` + `aria-invalid`. Bir <Field> içindeyse hata durumu ve
 * `aria-describedby` (hata/hint metni id'si) context'ten otomatik bağlanır.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { hasError, "aria-describedby": describedBy, ...props },
  ref,
) {
  const field = useFieldContext();
  const invalid = hasError ?? field?.invalid ?? false;
  return (
    <CatalystInput
      ref={ref}
      invalid={invalid || undefined}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy ?? field?.describedBy}
      {...props}
    />
  );
});
