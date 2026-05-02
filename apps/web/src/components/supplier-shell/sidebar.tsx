"use client";

import {
  isSupplierItemActive,
  supplierNavConfig,
} from "@/lib/supplier/nav-config";
import { useSupplierSidebar } from "@/lib/supplier/use-sidebar";
import { cn } from "@/lib/utils";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CompanyCard } from "./company-card";

export function SupplierSidebar() {
  const pathname = usePathname();
  const collapsed = useSupplierSidebar((s) => s.collapsed);
  const toggle = useSupplierSidebar((s) => s.toggle);

  return (
    <aside
      className={cn(
        "shrink-0 bg-white border-r border-surface-border flex flex-col",
        "transition-[width] duration-200 ease-in-out relative",
        collapsed ? "w-16" : "w-60",
      )}
      aria-label="Tedarikçi paneli kenar çubuğu"
    >
      <CompanyCard collapsed={collapsed} />

      <nav className="flex-1 px-2 py-4 space-y-0.5">
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
                <>
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.placeholder && (
                    <span className="text-[10px] uppercase tracking-wide font-semibold text-slate-400">
                      Yakında
                    </span>
                  )}
                </>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-3 border-t border-surface-border text-xs text-slate-400">
        {collapsed ? (
          <p className="text-center">v0.1</p>
        ) : (
          <>
            © 2026 Supkeys
            <div className="font-mono text-[10px] opacity-70 mt-0.5">
              v0.1 — supplier
            </div>
          </>
        )}
      </div>

      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? "Kenar çubuğunu aç" : "Kenar çubuğunu kapat"}
        className={cn(
          "absolute -right-3 top-20 z-10",
          "h-6 w-6 rounded-full bg-white border border-surface-border shadow-sm",
          "flex items-center justify-center text-slate-500 hover:text-brand-700 hover:border-brand-300",
          "transition-colors",
        )}
      >
        <ChevronLeft
          className={cn(
            "h-3.5 w-3.5 transition-transform",
            collapsed && "rotate-180",
          )}
        />
      </button>
    </aside>
  );
}
