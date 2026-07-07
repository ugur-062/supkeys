"use client";

import { Textarea as CatalystTextarea } from "@/components/catalyst/textarea";
import { useFieldContext } from "@/components/ui/field";
import { forwardRef, type TextareaHTMLAttributes } from "react";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  hasError?: boolean;
}

/**
 * Uygulama geneli Textarea — Catalyst Textarea'yı sarar. `hasError` → `invalid`
 * + `aria-invalid`. <Field> içindeyse hata durumu ve `aria-describedby`
 * context'ten otomatik bağlanır.
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
    { hasError, "aria-describedby": describedBy, ...props },
    ref,
  ) {
    const field = useFieldContext();
    const invalid = hasError ?? field?.invalid ?? false;
    return (
      <CatalystTextarea
        ref={ref}
        invalid={invalid || undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy ?? field?.describedBy}
        {...props}
      />
    );
  },
);
