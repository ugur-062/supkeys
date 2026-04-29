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
          className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-semibold text-sm">
            {initials}
          </div>
          <ChevronDown className="w-4 h-4 text-slate-400 hidden md:block" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="min-w-[240px] bg-white rounded-xl border border-surface-border shadow-lg p-1.5 z-50"
        >
          <div className="px-3 py-2.5">
            <div className="text-sm font-medium text-slate-900 truncate">
              {user?.firstName} {user?.lastName}
            </div>
            <div className="text-xs text-slate-500 truncate">{user?.email}</div>
            {user?.tenant && (
              <div className="mt-1.5 inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-xs text-slate-600">
                {user.tenant.name}
              </div>
            )}
          </div>

          <DropdownMenu.Separator className="h-px bg-surface-border my-1" />

          <DropdownMenu.Item asChild className={itemClass}>
            <Link href="#" onClick={(e) => e.preventDefault()}>
              <User className="w-4 h-4 text-slate-400" />
              Profil
              <span className="ml-auto text-[10px] text-slate-400 uppercase tracking-wide">
                yakında
              </span>
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
            className={cn(itemClass, "text-danger-600")}
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
