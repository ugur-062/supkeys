"use client";

import { isItemActive, type NavItem } from "@/lib/dashboard/nav-config";
import { cn } from "@/lib/utils";
import * as Tooltip from "@radix-ui/react-tooltip";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface SidebarItemProps {
  item: NavItem;
  collapsed: boolean;
}

export function SidebarItem({ item, collapsed }: SidebarItemProps) {
  const pathname = usePathname();
  const active = isItemActive(item.href, pathname);
  const Icon = item.icon;

  if (item.type === "cta") {
    const ctaContent = (
      <Link
        href={item.href}
        aria-label={item.label}
        className={cn(
          "group relative flex items-center rounded-lg font-semibold text-sm",
          "bg-gradient-to-br from-brand-600 to-brand-700 text-white",
          "hover:from-brand-500 hover:to-brand-600",
          "shadow-md hover:shadow-lg",
          "transition-[transform,box-shadow,background-color] duration-150",
          "hover:-translate-y-px",
          collapsed
            ? "justify-center w-9 h-9 mx-auto"
            : "gap-2 px-3 py-2.5 mx-1",
        )}
      >
        <span
          className={cn(
            "flex items-center justify-center rounded-md",
            collapsed
              ? "w-5 h-5"
              : "w-6 h-6 bg-white/15",
          )}
        >
          <Icon className="w-[14px] h-[14px]" strokeWidth={2.5} />
        </span>
        {!collapsed && <span className="truncate">{item.label}</span>}
      </Link>
    );

    if (!collapsed) return ctaContent;

    return (
      <Tooltip.Root delayDuration={150}>
        <Tooltip.Trigger asChild>{ctaContent}</Tooltip.Trigger>
        <SidebarTooltipContent>{item.label}</SidebarTooltipContent>
      </Tooltip.Root>
    );
  }

  // type === "link"
  const showBadge =
    item.type === "link" && typeof item.badge === "number" && item.badge > 0;

  const content = (
    <Link
      href={item.href}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center rounded-lg text-sm transition-colors",
        active
          ? "bg-gradient-to-r from-brand-50 to-brand-50/40 text-brand-700 font-semibold shadow-[inset_0_0_0_1px_rgb(var(--color-brand-100)/0.6)]"
          : "text-slate-600 font-medium hover:bg-slate-50 hover:text-slate-900",
        collapsed
          ? "justify-center w-9 h-9 mx-auto"
          : "gap-2.5 px-3 py-2 mx-1",
      )}
    >
      {/* Aktif sol kenar indicator */}
      {active && (
        <span
          aria-hidden
          className={cn(
            "absolute top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-brand-600",
            collapsed ? "left-[-7px]" : "left-0",
          )}
        />
      )}
      <Icon
        className={cn(
          "w-[18px] h-[18px] shrink-0 transition-colors",
          active
            ? "text-brand-600"
            : "text-slate-400 group-hover:text-slate-700",
        )}
      />
      {!collapsed && (
        <>
          <span className="truncate flex-1">{item.label}</span>
          {showBadge && (
            <span
              className={cn(
                "inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-semibold tabular-nums",
                active
                  ? "bg-brand-600 text-white"
                  : "bg-slate-200 text-slate-700",
              )}
            >
              {item.badge}
            </span>
          )}
        </>
      )}
    </Link>
  );

  if (!collapsed) return content;

  return (
    <Tooltip.Root delayDuration={150}>
      <Tooltip.Trigger asChild>{content}</Tooltip.Trigger>
      <SidebarTooltipContent>
        {item.label}
        {showBadge && ` (${item.badge})`}
      </SidebarTooltipContent>
    </Tooltip.Root>
  );
}

function SidebarTooltipContent({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip.Portal>
      <Tooltip.Content
        side="right"
        sideOffset={10}
        className="bg-brand-900 text-white text-xs font-medium px-2.5 py-1.5 rounded-md shadow-lg z-50"
      >
        {children}
        <Tooltip.Arrow className="fill-brand-900" />
      </Tooltip.Content>
    </Tooltip.Portal>
  );
}
