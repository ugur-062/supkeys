"use client";

import { RothernLogo } from "@/components/brand/logo";
import { Avatar } from "@/components/catalyst/avatar";
import {
  Dropdown,
  DropdownButton,
  DropdownDivider,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from "@/components/catalyst/dropdown";
import { useCompanyAuth, useCompanyLogout } from "@/hooks/use-company-auth";
import { PORTALS, type PortalKey } from "@/lib/company/portals";
import { cn } from "@/lib/utils";
import {
  ArrowRightStartOnRectangleIcon,
  ChevronDownIcon,
  Cog6ToothIcon,
} from "@heroicons/react/20/solid";
import Link from "next/link";
import { MessagesPopover } from "./messages-popover";
import { NotificationBell } from "./notification-bell";

function initialsOf(first?: string | null, last?: string | null) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?";
}

/**
 * Üst çubuk — BEYAZ; açık-mod logosu. Solda Rothern logosu + firma kimliği,
 * sağda mesajlar + bildirimler + kullanıcı. Satınalma/Satış geçişi sol menünün
 * en üstünde (Anasayfa'nın üzerinde — kullanıcı isteği).
 */
export function CompanyTopbar({
  activePortal,
  onOpenMobileNav,
}: {
  activePortal: PortalKey;
  onOpenMobileNav: () => void;
}) {
  const { company, user } = useCompanyAuth();
  const logout = useCompanyLogout();
  const isPaid = company?.tier === "PAKET";
  const portal = PORTALS[activePortal];

  return (
    <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-3 border-b border-zinc-950/10 bg-white px-3 sm:px-4">
      {/* Mobil: menü */}
      <button
        type="button"
        onClick={onOpenMobileNav}
        aria-label="Menüyü aç"
        className="flex size-9 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-950/5 hover:text-zinc-900 lg:hidden"
      >
        <svg viewBox="0 0 20 20" className="size-5 fill-current" aria-hidden>
          <path d="M2 6.75C2 6.33579 2.33579 6 2.75 6H17.25C17.6642 6 18 6.33579 18 6.75C18 7.16421 17.6642 7.5 17.25 7.5H2.75C2.33579 7.5 2 7.16421 2 6.75ZM2 13.25C2 12.8358 2.33579 12.5 2.75 12.5H17.25C17.6642 12.5 18 12.8358 18 13.25C18 13.6642 17.6642 14 17.25 14H2.75C2.33579 14 2 13.6642 2 13.25Z" />
        </svg>
      </button>

      {/* Logo — sol üst (açık-mod kilidi, plakasız) */}
      <Link href="/company" className="flex shrink-0 items-center">
        <RothernLogo
          variant="full-light"
          size="sm"
          priority
          className="h-8 w-auto"
        />
      </Link>

      {/* Firma kimliği */}
      <div className="hidden min-w-0 items-center gap-2.5 sm:flex">
        <div className="h-6 w-px bg-zinc-200" aria-hidden />
        <span className="truncate text-sm font-semibold text-zinc-900">
          {company?.name ?? "—"}
        </span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            isPaid ? "bg-amber-100 text-amber-700" : "bg-zinc-100 text-zinc-600",
          )}
        >
          {isPaid ? "Premium" : "Standart"}
        </span>
      </div>

      {/* Sağ: mesajlar + bildirimler + kullanıcı */}
      <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
        <MessagesPopover
          portal={activePortal}
          basePath={portal.basePath}
        />

        <NotificationBell portal={activePortal} />

        {user ? (
          <Dropdown>
            <DropdownButton
              plain
              aria-label="Hesap menüsü"
              className="!px-2"
            >
              <span className="flex items-center gap-2.5">
                <Avatar
                  square
                  initials={initialsOf(user.firstName, user.lastName)}
                  className="size-8 bg-zinc-900 text-white"
                  alt=""
                />
                <span className="hidden text-left md:block">
                  <span className="block max-w-40 truncate text-sm font-semibold text-zinc-900">
                    {user.firstName} {user.lastName}
                  </span>
                  <span className="block text-[11px] leading-tight text-zinc-500">
                    {user.isOwner ? "Kurucu" : (company?.name ?? "")}
                  </span>
                </span>
                <ChevronDownIcon className="hidden size-4 text-zinc-400 md:block" />
              </span>
            </DropdownButton>
            <DropdownMenu className="min-w-64" anchor="bottom end">
              {/* col-span-full ŞART: menü subgrid olduğundan ham div aksi halde
                  1. (ikon) kolonuna düşüp geniş e-posta ile kolonu şişirir →
                  ikonlar ile etiketler arası boşluk açılır. */}
              <div className="col-span-full px-3.5 pt-2.5 pb-2">
                <p className="text-sm font-semibold text-zinc-900">
                  {user.firstName} {user.lastName}
                  {user.isOwner ? (
                    <span className="text-amber-600"> · Kurucu</span>
                  ) : null}
                </p>
                <p className="truncate text-xs text-slate-400">{user.email}</p>
              </div>
              <DropdownDivider />
              <DropdownItem href="/company/ayarlar">
                <Cog6ToothIcon data-slot="icon" />
                <DropdownLabel>Ayarlar</DropdownLabel>
              </DropdownItem>
              <DropdownDivider />
              <DropdownItem onClick={() => logout()}>
                <ArrowRightStartOnRectangleIcon data-slot="icon" />
                <DropdownLabel>Çıkış Yap</DropdownLabel>
              </DropdownItem>
            </DropdownMenu>
          </Dropdown>
        ) : null}
      </div>
    </header>
  );
}
