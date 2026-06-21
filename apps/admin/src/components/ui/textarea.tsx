"use client";

import { Textarea as CatalystTextarea } from "@/components/catalyst/textarea";
import { forwardRef, type ComponentPropsWithoutRef } from "react";

interface TextareaProps
  extends ComponentPropsWithoutRef<typeof CatalystTextarea> {
  hasError?: boolean;
}

/**
 * Admin Textarea — Catalyst Textarea'yı sarar. `hasError` → data-invalid.
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ hasError, ...props }, ref) => {
    return (
      <CatalystTextarea
        ref={ref}
        data-invalid={hasError ? true : undefined}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";
