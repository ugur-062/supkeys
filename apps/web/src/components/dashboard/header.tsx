"use client";

import { Input } from "@/components/ui/input";
import { getBreadcrumbs } from "@/lib/dashboard/nav-config";
import { useSidebar } from "@/lib/dashboard/use-sidebar";
import { Bell, ChevronRight, Menu, Search } from "lucide-react";
import { usePathname } from "next/navigation";
import { UserDropdown } from "./user-dropdown";

export function Header() {
  const pathname = usePathname();
  const openMobile = useSidebar((s) => s.openMobile);
  const breadcrumbs = getBreadcrumbs(pathname ?? "/dashboard");
  const currentTitle = breadcrumbs[breadcrumbs.length - 1] ?? "Dashboard";
  const parentCrumbs = breadcrumbs.slice(0, -1);

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

        {/* Page title — breadcrumb üstte, başlık altta */}
        <div className="min-w-0 flex flex-col justify-center shrink-0">
          {parentCrumbs.length > 0 && (
            <nav
              aria-label="Breadcrumb"
              className="flex items-center gap-1 text-[11px] font-medium text-slate-400 leading-none"
            >
              {parentCrumbs.map((label, i) => (
                <div key={`${label}-${i}`} className="flex items-center gap-1">
                  {i > 0 && (
                    <ChevronRight className="w-3 h-3 text-slate-300" aria-hidden />
                  )}
                  <span>{label}</span>
                </div>
              ))}
            </nav>
          )}
          <h1
            className="font-display font-bold text-xl text-brand-900 leading-tight mt-0.5 truncate"
            title={currentTitle}
          >
            {currentTitle}
          </h1>
        </div>

        {/* Search */}
        <div className="hidden md:flex flex-1 justify-center">
          <div className="relative w-full max-w-md">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
              aria-hidden
            />
            <Input
              type="search"
              placeholder="Ara..."
              aria-label="Ara"
              className="pl-9 bg-slate-50 border-transparent focus:bg-white focus:border-brand-500 focus:shadow-sm"
            />
          </div>
        </div>

        {/* Sağ blok */}
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Bildirimler"
            className="relative p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <Bell className="w-5 h-5" />
            {/* Bildirim noktası — V1'de gizli, ileride dinamik açılacak */}
            {/* <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-danger-500 ring-2 ring-white" /> */}
          </button>
          <UserDropdown />
        </div>
      </div>
    </header>
  );
}
