"use client";

import { HeaderMessagesDropdown } from "@/components/messaging/header-messages-dropdown";
import { getSupplierBreadcrumb } from "@/lib/supplier/nav-config";
import { Bell } from "lucide-react";
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

      <div className="flex items-center gap-2 justify-end">
        <HeaderMessagesDropdown surface="supplier" />

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
