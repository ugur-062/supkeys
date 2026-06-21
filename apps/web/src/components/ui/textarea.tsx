"use client";

import { Textarea as CatalystTextarea } from "@/components/catalyst/textarea";
import { forwardRef, type TextareaHTMLAttributes } from "react";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  hasError?: boolean;
}

/**
 * Uygulama geneli Textarea — Catalyst Textarea'yı sarar. `hasError` → `invalid`.
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ hasError, ...props }, ref) {
    return (
      <CatalystTextarea ref={ref} invalid={hasError || undefined} {...props} />
    );
  },
);
