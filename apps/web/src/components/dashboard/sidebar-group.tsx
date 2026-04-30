"use client";

import type { NavGroup } from "@/lib/dashboard/nav-config";
import { cn } from "@/lib/utils";
import { SidebarItem } from "./sidebar-item";

interface SidebarGroupProps {
  group: NavGroup;
  collapsed: boolean;
}

export function SidebarGroup({ group, collapsed }: SidebarGroupProps) {
  return (
    <div className={cn(collapsed ? "py-1" : "")}>
      {!collapsed ? (
        <div className="px-4 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {group.label}
        </div>
      ) : (
        <div
          aria-hidden
          className="mx-3 mb-2 h-px bg-surface-border first:hidden"
        />
      )}
      <div className="space-y-0.5">
        {group.items.map((item) => (
          <SidebarItem key={item.href} item={item} collapsed={collapsed} />
        ))}
      </div>
    </div>
  );
}
