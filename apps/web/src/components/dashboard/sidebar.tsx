"use client";

import { SupkeysLogo } from "@/components/brand/logo";
import { useAuth } from "@/hooks/use-auth";
import { useSupplierStats } from "@/hooks/use-tenant-suppliers";
import {
  navConfig,
  profileNavItem,
  type NavGroup,
} from "@/lib/dashboard/nav-config";
import { useSidebar } from "@/lib/dashboard/use-sidebar";
import { cn } from "@/lib/utils";
import * as Tooltip from "@radix-ui/react-tooltip";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo } from "react";
import { SidebarGroup } from "./sidebar-group";
import { SidebarItem } from "./sidebar-item";

export function Sidebar() {
  const { collapsed, toggle, mobileOpen, closeMobile } = useSidebar();
  const { user } = useAuth();
  const supplierStats = useSupplierStats();

  // "Tedarikçiler" linkine canlı PENDING_TENANT_APPROVAL badge'i enjekte et
  const liveNavConfig = useMemo<NavGroup[]>(() => {
    const pending = supplierStats.data?.pending ?? 0;
    if (pending <= 0) return navConfig;
    return navConfig.map((group) => ({
      ...group,
      items: group.items.map((item) => {
        if (item.type === "link" && item.href === "/dashboard/tedarikciler") {
          return { ...item, badge: pending };
        }
        return item;
      }),
    }));
  }, [supplierStats.data?.pending]);

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
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 md:hidden"
        />
      )}

      <aside
        className={cn(
          "fixed md:sticky top-0 left-0 z-50 md:z-auto h-screen shrink-0",
          "bg-white border-r border-surface-border",
          "flex flex-col transition-[width,transform] duration-200 ease-out",
          collapsed ? "w-16" : "w-60",
          mobileOpen
            ? "translate-x-0"
            : "-translate-x-full md:translate-x-0",
        )}
      >
        {/* Logo + toggle */}
        <div
          className={cn(
            "relative flex items-center px-4 border-b border-surface-border h-16 shrink-0",
            collapsed ? "justify-center px-2" : "justify-between",
          )}
        >
          {!collapsed ? (
            <>
              <SupkeysLogo variant="full" size="md" priority />
              <button
                type="button"
                onClick={toggle}
                aria-label="Sidebar'ı küçült"
                className={cn(
                  "absolute right-[-12px] top-1/2 -translate-y-1/2",
                  "flex items-center justify-center w-6 h-6 rounded-full",
                  "bg-white border border-surface-border shadow-sm",
                  "text-slate-400 hover:text-brand-600 hover:border-brand-200 hover:bg-brand-50",
                  "transition-colors",
                )}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={toggle}
                aria-label="Sidebar'ı genişlet"
                title="Genişlet"
                className="flex items-center justify-center hover:opacity-80 transition-opacity"
              >
                <SupkeysLogo variant="icon" size="md" priority />
              </button>
              <button
                type="button"
                onClick={toggle}
                aria-label="Sidebar'ı genişlet"
                className={cn(
                  "absolute right-[-12px] top-1/2 -translate-y-1/2",
                  "flex items-center justify-center w-6 h-6 rounded-full",
                  "bg-white border border-surface-border shadow-sm",
                  "text-slate-400 hover:text-brand-600 hover:border-brand-200 hover:bg-brand-50",
                  "transition-colors",
                )}
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 space-y-5">
          {liveNavConfig.map((group) => (
            <SidebarGroup
              key={group.label}
              group={group}
              collapsed={collapsed}
            />
          ))}
        </nav>

        {/* Footer — Profil link + kullanıcı kartı */}
        <div className="border-t border-surface-border shrink-0 py-2">
          <div className="space-y-0.5">
            <SidebarItem item={profileNavItem} collapsed={collapsed} />
          </div>

          {collapsed ? (
            <div className="flex items-center justify-center pt-2">
              <div
                className="relative"
                title={`${user?.firstName ?? ""} ${user?.lastName ?? ""}`}
              >
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-100 to-brand-200 text-brand-700 flex items-center justify-center font-semibold text-sm">
                  {initials}
                </div>
                <span
                  aria-hidden
                  className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-success-500 ring-2 ring-white"
                />
              </div>
            </div>
          ) : (
            <div className="mx-1 mt-1 flex items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-slate-50 transition-colors">
              <div className="relative shrink-0">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-100 to-brand-200 text-brand-700 flex items-center justify-center font-semibold text-sm">
                  {initials}
                </div>
                <span
                  aria-hidden
                  className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-success-500 ring-2 ring-white"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-900 truncate leading-tight">
                  {user?.firstName} {user?.lastName}
                </div>
                <div className="text-xs text-slate-500 truncate mt-0.5">
                  {user?.tenant.name}
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>
    </Tooltip.Provider>
  );
}
