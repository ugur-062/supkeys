"use client";

import { getSupplierBreadcrumb } from "@/lib/supplier/nav-config";
import { Bell, Search } from "lucide-react";
import { usePathname } from "next/navigation";
import { SupplierUserDropdown } from "./user-dropdown";

export function SupplierHeader() {
  const pathname = usePathname();
  const breadcrumb = pathname ? getSupplierBreadcrumb(pathname) : "—";

  return (
    <header className="sticky top-0 z-20 h-16 bg-white/80 backdrop-blur border-b border-surface-border px-4 md:px-6 flex items-center justify-between gap-4">
      <div>
        <p className="text-[11px] uppercase tracking-wider text-slate-400">
          Tedarikçi Paneli
        </p>
        <h1 className="font-display text-lg font-bold text-brand-900 leading-tight truncate">
          {breadcrumb}
        </h1>
      </div>

      <div className="flex items-center gap-2 flex-1 max-w-md justify-end">
        <div className="relative hidden md:block flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="search"
            disabled
            placeholder="Ara… (yakında)"
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-50 border border-transparent text-sm placeholder:text-slate-400 focus:outline-none disabled:cursor-not-allowed"
          />
        </div>

        <button
          type="button"
          disabled
          className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-surface-muted transition-colors disabled:cursor-not-allowed"
          title="Bildirimler — yakında"
          aria-label="Bildirimler"
        >
          <Bell className="h-4 w-4" />
        </button>

        <SupplierUserDropdown />
      </div>
    </header>
  );
}
