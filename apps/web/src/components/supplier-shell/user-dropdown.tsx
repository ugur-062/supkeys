"use client";

import {
  useSupplierAuth,
  useSupplierLogout,
} from "@/hooks/use-supplier-auth";
import { cn } from "@/lib/utils";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, LogOut, Settings, User } from "lucide-react";
import Link from "next/link";

export function SupplierUserDropdown() {
  const { supplierUser } = useSupplierAuth();
  const logout = useSupplierLogout();

  if (!supplierUser) return null;

  const initials =
    `${supplierUser.firstName?.[0] ?? ""}${supplierUser.lastName?.[0] ?? ""}`
      .toUpperCase() || "?";

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-muted transition-colors"
          aria-label="Kullanıcı menüsü"
        >
          <div className="h-8 w-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-sm font-semibold">
            {initials}
          </div>
          <div className="hidden md:flex flex-col items-start leading-tight">
            <span className="text-sm font-medium text-brand-900 truncate max-w-[160px]">
              {supplierUser.firstName} {supplierUser.lastName}
            </span>
            <span className="text-xs text-slate-500 truncate max-w-[160px]">
              {supplierUser.email}
            </span>
          </div>
          <ChevronDown className="h-4 w-4 text-slate-400" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className={cn(
            "z-50 min-w-[220px] rounded-lg border border-surface-border bg-white p-1 shadow-lg",
          )}
        >
          <div className="px-3 py-2 border-b border-surface-border">
            <p className="text-sm font-semibold text-brand-900 truncate">
              {supplierUser.firstName} {supplierUser.lastName}
            </p>
            <p className="text-xs text-slate-500 truncate">
              {supplierUser.email}
            </p>
          </div>
          <DropdownMenu.Item asChild>
            <Link
              href="/supplier/profil"
              className="flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-surface-muted cursor-pointer outline-none"
            >
              <User className="h-4 w-4" />
              Profilim
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link
              href="/supplier/ayarlar"
              className="flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-surface-muted cursor-pointer outline-none"
            >
              <Settings className="h-4 w-4" />
              Ayarlar
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="h-px bg-surface-border my-1" />
          <DropdownMenu.Item
            onSelect={() => logout()}
            className="flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-danger-50 text-danger-600 cursor-pointer outline-none"
          >
            <LogOut className="h-4 w-4" />
            Çıkış
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
