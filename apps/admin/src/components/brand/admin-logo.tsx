import { cn } from "@/lib/utils";

interface AdminLogoProps {
  className?: string;
  /** Sidebar (koyu zemin) için beyaz tipografi varyantı */
  variant?: "light" | "dark";
  /** "ADMIN" rozetini göster */
  badge?: boolean;
}

export function AdminLogo({
  className,
  variant = "dark",
  badge = true,
}: AdminLogoProps) {
  const isLight = variant === "light";

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-brand-600 text-white font-display font-bold text-lg shrink-0">
        S
      </div>
      <div className="flex items-baseline gap-0.5">
        <span
          className={cn(
            "font-display font-bold text-xl",
            isLight ? "text-white" : "text-brand-900",
          )}
        >
          sup
        </span>
        <span
          className={cn(
            "font-display font-bold text-xl",
            isLight ? "text-brand-400" : "text-brand-600",
          )}
        >
          keys
        </span>
      </div>
      {badge && (
        <span className="ml-1 admin-pill-danger">Admin</span>
      )}
    </div>
  );
}
