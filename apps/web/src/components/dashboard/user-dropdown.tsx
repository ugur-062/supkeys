"use client";

import { useAuth, useLogout } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, LogOut, Settings, User } from "lucide-react";
import Link from "next/link";

export function UserDropdown() {
  const { user } = useAuth();
  const logout = useLogout();

  const initials = user
    ? `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase()
    : "??";

  const itemClass = cn(
    "flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 rounded-md cursor-pointer outline-none",
    "data-[highlighted]:bg-slate-100 data-[highlighted]:text-slate-900",
  );

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="Hesap menüsü"
          className="flex items-center gap-2 px-1.5 py-1 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <div className="relative">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-100 to-brand-200 text-brand-700 flex items-center justify-center font-semibold text-sm">
              {initials}
            </div>
            <span
              aria-hidden
              className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-success-500 ring-2 ring-white"
            />
          </div>
          <ChevronDown className="w-4 h-4 text-slate-400 hidden md:block" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={10}
          className="w-72 max-w-72 bg-white rounded-xl border border-surface-border shadow-lg p-1.5 z-50"
        >
          {/* Header — avatar + ad + e-posta + tenant rozeti */}
          <div className="px-2.5 py-3 flex items-start gap-3">
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
                {user?.email}
              </div>
              {user?.tenant && (
                <div className="mt-1.5 inline-flex items-center px-2 py-0.5 rounded-md bg-brand-50 border border-brand-100 text-[11px] font-medium text-brand-700">
                  {user.tenant.name}
                </div>
              )}
            </div>
          </div>

          <DropdownMenu.Separator className="h-px bg-surface-border my-1" />

          <DropdownMenu.Item asChild className={itemClass}>
            <Link href="/dashboard/profil">
              <User className="w-4 h-4 text-slate-400" />
              Profilim
            </Link>
          </DropdownMenu.Item>

          <DropdownMenu.Item asChild className={itemClass}>
            <Link href="/dashboard/ayarlar">
              <Settings className="w-4 h-4 text-slate-400" />
              Ayarlar
            </Link>
          </DropdownMenu.Item>

          <DropdownMenu.Separator className="h-px bg-surface-border my-1" />

          <DropdownMenu.Item
            className={cn(itemClass, "text-danger-600 data-[highlighted]:bg-danger-50 data-[highlighted]:text-danger-700")}
            onSelect={(e) => {
              e.preventDefault();
              logout();
            }}
          >
            <LogOut className="w-4 h-4" />
            Çıkış Yap
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
