"use client";

import { Field } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import {
  Controller,
  type Control,
  type FieldErrors,
  type Path,
} from "react-hook-form";

interface TermsCheckboxProps<T extends { termsAccepted: boolean }> {
  control: Control<T>;
  errors: FieldErrors<T>;
}

export function TermsCheckbox<T extends { termsAccepted: boolean }>({
  control,
  errors,
}: TermsCheckboxProps<T>) {
  const error = (errors as Record<string, { message?: string }>).termsAccepted
    ?.message;

  return (
    <Field error={error}>
      <Controller
        control={control}
        name={"termsAccepted" as Path<T>}
        render={({ field }) => (
          <label
            className={cn(
              "flex items-start gap-3 cursor-pointer p-3 rounded-lg border transition-colors",
              error
                ? "border-danger-500 bg-danger-50/30"
                : "border-surface-border hover:bg-brand-50/40",
            )}
          >
            <input
              type="checkbox"
              checked={!!field.value}
              onChange={(e) => field.onChange(e.target.checked)}
              onBlur={field.onBlur}
              className="mt-0.5 w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/30"
            />
            <span className="text-sm text-slate-700 leading-relaxed">
              <a
                href="#kvkk"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-600 hover:text-brand-700 underline-offset-4 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                KVKK Aydınlatma Metni
              </a>
              {"'ni ve "}
              <a
                href="#tos"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-600 hover:text-brand-700 underline-offset-4 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                Hizmet Şartları
              </a>
              {"'nı okudum, onaylıyorum."}
            </span>
          </label>
        )}
      />
    </Field>
  );
}
