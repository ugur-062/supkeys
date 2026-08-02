"use client";

import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  XCircle,
  type LucideIcon,
} from "lucide-react";

/**
 * P2 (frontend denetimi §9) — TEK bilgi kutusu. "Teklifin değerlendiriliyor"
 * (mavi ikonlu) ile "Kapalı zarf…" (ikonsuz gri) gibi aynı işi yapan farklı
 * görünümler bu bileşene iner. Başarı kutuları gerçekten başarı gibi görünür
 * (ikon SVG — metin karakteri ✓ değil). MyBidStatusPanel'in StatusAlert'i
 * buradan beslenir.
 */
export type CalloutVariant =
  | "success"
  | "info"
  | "warning"
  | "danger"
  | "neutral";

const VARIANT_CLASSES: Record<CalloutVariant, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  info: "border-blue-200 bg-blue-50 text-blue-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  danger: "border-rose-200 bg-rose-50 text-rose-800",
  neutral: "border-zinc-200 bg-zinc-50 text-zinc-600",
};

const VARIANT_ICON: Record<CalloutVariant, LucideIcon> = {
  success: CheckCircle2,
  info: Info,
  warning: AlertTriangle,
  danger: XCircle,
  neutral: Info,
};

export function Callout({
  variant,
  title,
  children,
  icon,
  className,
}: {
  variant: CalloutVariant;
  /** Kalın ilk satır; yalnız gövde istenirse boş bırakılabilir. */
  title?: string;
  children?: React.ReactNode;
  /** Varyant ikonunu ezmek için (ör. Lock — kapalı zarf). */
  icon?: LucideIcon;
  className?: string;
}) {
  const Icon = icon ?? VARIANT_ICON[variant];
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border p-4",
        VARIANT_CLASSES[variant],
        className,
      )}
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 text-sm">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? (
          <div className={title ? "mt-1" : undefined}>{children}</div>
        ) : null}
      </div>
    </div>
  );
}
