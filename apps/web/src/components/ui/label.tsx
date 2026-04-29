import { cn } from "@/lib/utils";
import type { LabelHTMLAttributes } from "react";

interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
}

export function Label({ children, required, className, ...props }: LabelProps) {
  return (
    <label
      className={cn(
        "block text-sm font-medium text-brand-900 mb-1.5",
        className,
      )}
      {...props}
    >
      {children}
      {required && <span className="text-danger-500 ml-0.5">*</span>}
    </label>
  );
}
