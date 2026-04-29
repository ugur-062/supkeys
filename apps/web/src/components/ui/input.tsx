import { cn } from "@/lib/utils";
import { forwardRef, type InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, hasError, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "w-full px-3.5 py-2.5 rounded-lg border bg-white",
          "text-brand-900 text-sm placeholder:text-slate-400",
          "transition-colors",
          "focus:outline-none focus:ring-2 focus:ring-offset-0",
          hasError
            ? "border-danger-500 focus:ring-danger-500/30 focus:border-danger-500"
            : "border-surface-border focus:ring-brand-500/30 focus:border-brand-500",
          "disabled:bg-surface-muted disabled:cursor-not-allowed",
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";
