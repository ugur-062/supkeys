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

  return (
    <header className="sticky top-0 z-30 h-16 bg-white border-b border-surface-border">
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

        {/* Breadcrumb */}
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1.5 text-sm shrink-0"
        >
          {breadcrumbs.map((label, i) => {
            const isLast = i === breadcrumbs.length - 1;
            return (
              <div key={`${label}-${i}`} className="flex items-center gap-1.5">
                {i > 0 && (
                  <ChevronRight
                    className="w-3.5 h-3.5 text-slate-300"
                    aria-hidden
                  />
                )}
                <span
                  className={
                    isLast
                      ? "font-medium text-slate-900"
                      : "text-slate-500"
                  }
                >
                  {label}
                </span>
              </div>
            );
          })}
        </nav>

        {/* Search — orta */}
        <div className="hidden md:block flex-1 max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              type="search"
              placeholder="Ara..."
              className="pl-9 bg-slate-50 border-transparent focus:bg-white"
              aria-label="Ara"
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
            {/* Bildirim badge'ı için yer — V1'de gizli */}
          </button>
          <UserDropdown />
        </div>
      </div>
    </header>
  );
}
