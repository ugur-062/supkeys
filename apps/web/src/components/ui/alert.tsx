"use client";

import { cn } from "@/lib/utils";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  XCircleIcon,
} from "@heroicons/react/20/solid";
import type { ComponentType, ReactNode, SVGProps } from "react";

type AlertVariant = "info" | "success" | "warning" | "danger";

const STYLES: Record<
  AlertVariant,
  {
    box: string;
    icon: string;
    title: string;
    body: string;
    Icon: ComponentType<SVGProps<SVGSVGElement>>;
  }
> = {
  // info = nötr (mavi yerine zinc — markada mavi yok)
  info: {
    box: "bg-zinc-50",
    icon: "text-zinc-400",
    title: "text-zinc-900",
    body: "text-zinc-700",
    Icon: InformationCircleIcon,
  },
  success: {
    box: "bg-green-50",
    icon: "text-green-400",
    title: "text-green-800",
    body: "text-green-700",
    Icon: CheckCircleIcon,
  },
  warning: {
    box: "bg-amber-50",
    icon: "text-amber-400",
    title: "text-amber-800",
    body: "text-amber-700",
    Icon: ExclamationTriangleIcon,
  },
  danger: {
    box: "bg-red-50",
    icon: "text-red-400",
    title: "text-red-800",
    body: "text-red-700",
    Icon: XCircleIcon,
  },
};

/**
 * Tailwind Plus "feedback/alerts" deseni — hata/uyarı/bilgi/başarı kutuları.
 * Tüm inline callout'lar bunu kullanır.
 */
export function Alert({
  variant = "info",
  title,
  children,
  className,
}: {
  variant?: AlertVariant;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const s = STYLES[variant];
  const Icon = s.Icon;
  return (
    <div className={cn("rounded-md p-4", s.box, className)}>
      <div className="flex">
        <div className="shrink-0">
          <Icon aria-hidden="true" className={cn("size-5", s.icon)} />
        </div>
        <div className="ml-3 text-sm">
          {title ? (
            <h3 className={cn("font-medium", s.title)}>{title}</h3>
          ) : null}
          {children ? (
            <div className={cn(title && "mt-2", s.body)}>{children}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
