"use client";

import { cn } from "@/lib/utils";
import { createContext, useContext, useId } from "react";

interface FieldContextValue {
  /** aria-describedby id — hata varsa error id, yoksa hint id, yoksa undefined. */
  describedBy?: string;
  /** Hata durumu — içindeki kontrol aria-invalid için okur. */
  invalid: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

/**
 * ui/Input, ui/Textarea gibi kontroller Field içindeyse aria bilgisini buradan
 * okur; böylece hata metni programatik olarak input'a bağlanır (aria-describedby)
 * ve aria-invalid otomatik ayarlanır.
 */
export function useFieldContext(): FieldContextValue | null {
  return useContext(FieldContext);
}

interface FieldProps {
  children: React.ReactNode;
  error?: string;
  hint?: string;
  className?: string;
}

export function Field({ children, error, hint, className }: FieldProps) {
  const base = useId();
  const errorId = `${base}-error`;
  const hintId = `${base}-hint`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <FieldContext.Provider value={{ describedBy, invalid: !!error }}>
      <div className={cn("space-y-1", className)}>
        {children}
        {error ? (
          <p id={errorId} className="text-xs text-danger-600 mt-1">
            {error}
          </p>
        ) : hint ? (
          <p id={hintId} className="text-xs text-slate-500 mt-1">
            {hint}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}
