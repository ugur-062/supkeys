"use client";

import { Checkbox } from "@/components/catalyst/checkbox";
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
          <div
            className={cn(
              "flex items-start gap-3 p-3 rounded-lg border transition-colors",
              error
                ? "border-danger-500 bg-danger-50/30"
                : "border-surface-border hover:bg-zinc-50/40",
            )}
          >
            <Checkbox
              checked={!!field.value}
              onChange={(checked) => field.onChange(checked)}
              onBlur={field.onBlur}
              className="mt-0.5"
            />
            <span className="text-sm text-slate-700 leading-relaxed">
              <a
                href="#kvkk"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-600 hover:text-zinc-700 underline-offset-4 hover:underline"
              >
                KVKK Aydınlatma Metni
              </a>
              {"'ni ve "}
              <a
                href="#tos"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-600 hover:text-zinc-700 underline-offset-4 hover:underline"
              >
                Hizmet Şartları
              </a>
              {"'nı okudum, onaylıyorum."}
            </span>
          </div>
        )}
      />
    </Field>
  );
}
