"use client";

import { HeaderMessagesDropdown } from "@/components/messaging/header-messages-dropdown";
import { getSupplierBreadcrumb } from "@/lib/supplier/nav-config";
import { useSupplierSidebar } from "@/lib/supplier/use-sidebar";
import { Bell, Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { SupplierUserDropdown } from "./user-dropdown";

export function SupplierHeader() {
  const pathname = usePathname();
  const breadcrumb = pathname ? getSupplierBreadcrumb(pathname) : "—";
  const openMobile = useSupplierSidebar((s) => s.openMobile);

  return (
    <header className="sticky top-0 z-30 h-16 bg-white/85 backdrop-blur-md border-b border-surface-border">
      <div className="h-full px-4 md:px-6 flex items-center gap-3 md:gap-6">
        {/* Mobile hamburger */}
        <button
          type="button"
          onClick={openMobile}
          aria-label="Menüyü aç"
          className="md:hidden p-2 rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-100"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Başlık — sabit "Tedarikçi Paneli" üstte küçük + breadcrumb altta */}
        <div className="min-w-0 flex flex-col justify-center shrink-0">
          <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400 leading-none">
            Tedarikçi Paneli
          </p>
          <h1
            className="font-display font-bold text-xl text-brand-900 leading-tight mt-0.5 truncate"
            title={breadcrumb}
          >
            {breadcrumb}
          </h1>
        </div>

        {/* Sağ blok */}
        <div className="ml-auto flex items-center gap-1.5">
          <HeaderMessagesDropdown surface="supplier" />
          <button
            type="button"
            disabled
            aria-label="Bildirimler"
            title="Bildirimler — yakında"
            className="relative p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors disabled:cursor-not-allowed"
          >
            <Bell className="w-5 h-5" />
          </button>
          <SupplierUserDropdown />
        </div>
      </div>
    </header>
  );
}
