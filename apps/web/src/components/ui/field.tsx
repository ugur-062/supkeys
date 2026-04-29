import { cn } from "@/lib/utils";

interface FieldProps {
  children: React.ReactNode;
  error?: string;
  hint?: string;
  className?: string;
}

export function Field({ children, error, hint, className }: FieldProps) {
  return (
    <div className={cn("space-y-1", className)}>
      {children}
      {error ? (
        <p className="text-xs text-danger-600 mt-1">{error}</p>
      ) : hint ? (
        <p className="text-xs text-slate-500 mt-1">{hint}</p>
      ) : null}
    </div>
  );
}
