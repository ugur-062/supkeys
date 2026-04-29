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
    <div className={cn("space-y-1", collapsed && "py-1")}>
      {!collapsed && (
        <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {group.label}
        </div>
      )}
      {collapsed && (
        <div
          aria-hidden
          className="mx-3 my-2 h-px bg-surface-border first:hidden"
        />
      )}
      <div className="space-y-0.5">
        {group.items.map((item) => (
          <SidebarItem
            key={item.href}
            item={item}
            collapsed={collapsed}
          />
        ))}
      </div>
    </div>
  );
}
