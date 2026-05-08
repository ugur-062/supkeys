"use client";

import { cn } from "@/lib/utils";
import { AlertCircle } from "lucide-react";
import type { ReactNode } from "react";

interface Props {
  label: string;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}

/**
 * Polish-3 — Form alanı sarıcı.
 *
 * Backend doğrulama hatalarını inline gösterir (`extractFieldErrors`'dan
 * gelen `error` prop'u). Hint sadece error olmadığında görünür.
 *
 * Örnek:
 *   const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
 *   <FormField label="E-posta" required error={fieldErrors.email}>
 *     <Input value={email} onChange={...} />
 *   </FormField>
 */
export function FormField({
  label,
  htmlFor,
  required,
  error,
  hint,
  children,
  className,
}: Props) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="block text-sm font-semibold text-brand-900"
      >
        {label}
        {required ? <span className="text-danger-500 ml-1">*</span> : null}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-danger-600 flex items-center gap-1">
          <AlertCircle className="h-3 w-3 flex-shrink-0" />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p className="text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}
