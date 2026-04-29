"use client";

import { SupkeysLogo } from "@/components/brand/logo";
import { useAuth } from "@/hooks/use-auth";
import { navConfig } from "@/lib/dashboard/nav-config";
import { useSidebar } from "@/lib/dashboard/use-sidebar";
import { cn } from "@/lib/utils";
import * as Tooltip from "@radix-ui/react-tooltip";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SidebarGroup } from "./sidebar-group";

export function Sidebar() {
  const { collapsed, toggle, mobileOpen, closeMobile } = useSidebar();
  const { user } = useAuth();

  const initials = user
    ? `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase()
    : "??";

  return (
    <Tooltip.Provider>
      {/* Mobil overlay */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Menüyü kapat"
          onClick={closeMobile}
          className="fixed inset-0 bg-slate-900/40 z-40 md:hidden"
        />
      )}

      <aside
        className={cn(
          "fixed md:sticky top-0 left-0 z-50 md:z-auto h-screen shrink-0",
          "bg-white border-r border-surface-border",
          "flex flex-col transition-[width,transform] duration-200 ease-out",
          collapsed ? "w-16" : "w-60",
          // Mobile: gizliyken sol dışarıda, açıldığında slide
          mobileOpen
            ? "translate-x-0"
            : "-translate-x-full md:translate-x-0",
        )}
      >
        {/* Logo + toggle */}
        <div
          className={cn(
            "flex items-center justify-between px-4 py-4 border-b border-surface-border h-16 shrink-0",
            collapsed && "justify-center px-2",
          )}
        >
          {!collapsed ? (
            <>
              <SupkeysLogo />
              <button
                type="button"
                onClick={toggle}
                aria-label="Sidebar'ı küçült"
                className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={toggle}
              aria-label="Sidebar'ı genişlet"
              className="flex items-center justify-center w-9 h-9 rounded-lg bg-brand-600 text-white font-display font-bold text-lg hover:bg-brand-700 transition-colors"
              title="Genişlet"
            >
              S
            </button>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
          {navConfig.map((group) => (
            <SidebarGroup
              key={group.label}
              group={group}
              collapsed={collapsed}
            />
          ))}
        </nav>

        {/* Footer — küçük kullanıcı kartı */}
        <div className="border-t border-surface-border shrink-0">
          {collapsed ? (
            <div className="flex items-center justify-center py-3">
              <div
                className="w-9 h-9 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-semibold text-sm"
                title={`${user?.firstName ?? ""} ${user?.lastName ?? ""}`}
              >
                {initials}
              </div>
            </div>
          ) : (
            <div className="px-3 py-3 flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-semibold text-sm shrink-0">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-900 truncate">
                  {user?.firstName} {user?.lastName}
                </div>
                <div className="text-xs text-slate-500 truncate">
                  {user?.tenant.name}
                </div>
              </div>
              <button
                type="button"
                onClick={toggle}
                aria-label="Sidebar'ı küçült"
                className="hidden md:block p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <ChevronRight className="w-3.5 h-3.5 rotate-180" />
              </button>
            </div>
          )}
        </div>
      </aside>
    </Tooltip.Provider>
  );
}
