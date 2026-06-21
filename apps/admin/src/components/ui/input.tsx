"use client";

import { Input as CatalystInput } from "@/components/catalyst/input";
import { forwardRef, type ComponentPropsWithoutRef } from "react";

interface InputProps extends ComponentPropsWithoutRef<typeof CatalystInput> {
  hasError?: boolean;
}

/**
 * Admin Input — Catalyst Input'u sarar. `hasError` → data-invalid (kırmızı ring).
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ hasError, ...props }, ref) => {
    return (
      <CatalystInput
        ref={ref}
        data-invalid={hasError ? true : undefined}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";
