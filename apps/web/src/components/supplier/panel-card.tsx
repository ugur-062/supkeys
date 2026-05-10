import { cn } from "@/lib/utils";

interface Props {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Padding boyutu — default md (p-5) */
  padding?: "sm" | "md" | "lg" | "none";
}

const PADDING: Record<NonNullable<Props["padding"]>, string> = {
  none: "",
  sm: "p-4",
  md: "p-5",
  lg: "p-6",
};

/**
 * V2-5 — Tedarikçi panelinde tutarlı kullanım için ortak kart kaplaması.
 * Modern dashboard stili: yumuşak border + shadow-sm + 2xl radius.
 */
export function PanelCard({
  title,
  subtitle,
  action,
  children,
  className,
  padding = "md",
}: Props) {
  return (
    <div
      className={cn(
        "bg-white border border-slate-200/80 rounded-2xl shadow-sm",
        PADDING[padding],
        className,
      )}
    >
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            {title && (
              <h3 className="font-display font-bold text-base text-brand-900">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
            )}
          </div>
          {action ? <div className="flex-shrink-0">{action}</div> : null}
        </div>
      )}
      {children}
    </div>
  );
}
