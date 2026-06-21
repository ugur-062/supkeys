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
 * Alıcı panelinin `.card` utility'siyle aynı bordür/radius/gölge —
 * iki panel arasında görsel tutarlılık.
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
        "bg-white rounded-xl shadow-sm ring-1 ring-zinc-950/5",
        PADDING[padding],
        className,
      )}
    >
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            {title && (
              <h3 className="text-base/7 font-semibold text-zinc-950">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="text-sm text-zinc-500 mt-0.5">{subtitle}</p>
            )}
          </div>
          {action ? <div className="flex-shrink-0">{action}</div> : null}
        </div>
      )}
      {children}
    </div>
  );
}
