"use client";

import { useSupplierAuth } from "@/hooks/use-supplier-auth";
import {
  isSupplierItemActive,
  supplierNavConfig,
} from "@/lib/supplier/nav-config";
import { useSupplierSidebar } from "@/lib/supplier/use-sidebar";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CompanyCard } from "./company-card";

export function SupplierSidebar() {
  const pathname = usePathname();
  const collapsed = useSupplierSidebar((s) => s.collapsed);
  const toggle = useSupplierSidebar((s) => s.toggle);
  const mobileOpen = useSupplierSidebar((s) => s.mobileOpen);
  const closeMobile = useSupplierSidebar((s) => s.closeMobile);
  const { supplierUser } = useSupplierAuth();

  const initials = supplierUser
    ? `${supplierUser.firstName?.[0] ?? ""}${supplierUser.lastName?.[0] ?? ""}`.toUpperCase()
    : "??";

  return (
    <>
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
        aria-label="Tedarikçi paneli kenar çubuğu"
      >
        {/* Firma kartı (tedarikçi-özel branding) + toggle */}
        <div className="relative shrink-0">
          <CompanyCard collapsed={collapsed} />
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? "Kenar çubuğunu aç" : "Kenar çubuğunu kapat"}
            className={cn(
              "absolute right-[-12px] top-1/2 -translate-y-1/2",
              "flex items-center justify-center w-6 h-6 rounded-full",
              "bg-white border border-surface-border shadow-sm",
              "text-slate-400 hover:text-brand-600 hover:border-brand-200 hover:bg-brand-50",
              "transition-colors",
            )}
          >
            {collapsed ? (
              <ChevronRight className="w-3.5 h-3.5" />
            ) : (
              <ChevronLeft className="w-3.5 h-3.5" />
            )}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-0.5">
          {supplierNavConfig.map((item) => {
            const Icon = item.icon;
            const active = isSupplierItemActive(item.href, pathname);

            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium",
                  "transition-colors",
                  active
                    ? "bg-brand-50 text-brand-700"
                    : "text-slate-600 hover:bg-surface-muted hover:text-brand-900",
                  active &&
                    "before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-r-full before:bg-brand-600",
                  collapsed && "justify-center px-2",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && (
                  <span className="flex-1 truncate">{item.label}</span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer — kullanıcı kartı (alıcı pattern) */}
        <div className="border-t border-surface-border shrink-0 py-2">
          {collapsed ? (
            <div className="flex items-center justify-center pt-2 pb-1">
              <div
                className="relative"
                title={`${supplierUser?.firstName ?? ""} ${supplierUser?.lastName ?? ""}`}
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
                  {supplierUser?.firstName} {supplierUser?.lastName}
                </div>
                <div className="text-xs text-slate-500 truncate mt-0.5">
                  {supplierUser?.email}
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
