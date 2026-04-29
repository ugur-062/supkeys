import { cn } from "@/lib/utils";
import { forwardRef, type TextareaHTMLAttributes } from "react";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  hasError?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, hasError, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          "w-full px-3.5 py-2.5 rounded-lg border bg-white resize-y min-h-[100px]",
          "text-admin-text text-sm placeholder:text-slate-400",
          "transition-colors",
          "focus:outline-none focus:ring-2 focus:ring-offset-0",
          hasError
            ? "border-danger-500 focus:ring-danger-500/30 focus:border-danger-500"
            : "border-admin-border-strong focus:ring-brand-500/30 focus:border-brand-500",
          "disabled:bg-surface-muted disabled:cursor-not-allowed",
          className,
        )}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";
