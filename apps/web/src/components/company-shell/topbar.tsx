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
import { useUnreadMessages } from "@/hooks/use-company-messages";
import { usePortalStore } from "@/lib/company/portal-store";
import {
  PORTALS,
  PORTAL_ORDER,
  accessiblePortals,
  type PortalKey,
} from "@/lib/company/portals";
import { cn } from "@/lib/utils";
import {
  ArrowRightStartOnRectangleIcon,
  ChevronDownIcon,
  Cog6ToothIcon,
} from "@heroicons/react/20/solid";
import { MessageSquare } from "lucide-react";
import Link from "next/link";
import { NotificationBell } from "./notification-bell";

function initialsOf(first?: string | null, last?: string | null) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?";
}

/** Siyah zemin üzerinde portal seçici — aktif portal beyaz zeminde aksan rengiyle. */
function PortalSwitcher({ activePortal }: { activePortal: PortalKey }) {
  const { company, user } = useCompanyAuth();
  const setLastPortal = usePortalStore((s) => s.setLastPortal);
  const available = accessiblePortals(user?.roles ?? [], company?.tier);
  if (available.length < 2) return null;

  return (
    <div className="hidden items-center gap-1 rounded-lg bg-white/10 p-1 md:flex">
      {PORTAL_ORDER.filter((p) => available.includes(p)).map((p) => {
        const def = PORTALS[p];
        const on = p === activePortal;
        return (
          <Link
            key={p}
            href={def.basePath}
            onClick={() => setLastPortal(p)}
            className={cn(
              "rounded-md px-4 py-1.5 text-xs font-semibold whitespace-nowrap transition",
              on
                ? p === "satinalma"
                  ? "bg-white text-blue-700 shadow-sm"
                  : "bg-white text-emerald-700 shadow-sm"
                : "text-zinc-300 hover:text-white",
            )}
          >
            {def.label}
          </Link>
        );
      })}
    </div>
  );
}

/**
 * Üst çubuk — TAM SİYAH. Solda Rothern logosu + firma kimliği, ortada
 * Satınalma/Satış portal seçici, sağda mesajlar + bildirimler + kullanıcı.
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
  const { data: unreadData } = useUnreadMessages();
  const unreadMsgs = unreadData?.count ?? 0;
  const isPaid = company?.tier === "PAKET";
  const portal = PORTALS[activePortal];

  return (
    <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-3 bg-zinc-950 px-3 sm:px-4">
      {/* Mobil: menü */}
      <button
        type="button"
        onClick={onOpenMobileNav}
        aria-label="Menüyü aç"
        className="flex size-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/10 hover:text-white lg:hidden"
      >
        <svg viewBox="0 0 20 20" className="size-5 fill-current" aria-hidden>
          <path d="M2 6.75C2 6.33579 2.33579 6 2.75 6H17.25C17.6642 6 18 6.33579 18 6.75C18 7.16421 17.6642 7.5 17.25 7.5H2.75C2.33579 7.5 2 7.16421 2 6.75ZM2 13.25C2 12.8358 2.33579 12.5 2.75 12.5H17.25C17.6642 12.5 18 12.8358 18 13.25C18 13.6642 17.6642 14 17.25 14H2.75C2.33579 14 2 13.6642 2 13.25Z" />
        </svg>
      </button>

      {/* Logo — sol üst (şeffaf beyaz wordmark, siyah zeminde plakasız) */}
      <Link href="/company" className="flex shrink-0 items-center">
        <RothernLogo
          variant="full-white"
          size="sm"
          priority
          className="h-7 w-auto"
        />
      </Link>

      {/* Firma kimliği */}
      <div className="hidden min-w-0 items-center gap-2.5 sm:flex">
        <div className="h-6 w-px bg-white/15" aria-hidden />
        <span className="truncate text-sm font-semibold text-white">
          {company?.name ?? "—"}
        </span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            isPaid ? "bg-amber-400/15 text-amber-300" : "bg-white/10 text-zinc-300",
          )}
        >
          {isPaid ? "Tek Paket" : "Standart"}
        </span>
      </div>

      {/* Orta: portal seçici */}
      <div className="flex flex-1 justify-center">
        <PortalSwitcher activePortal={activePortal} />
      </div>

      {/* Sağ: mesajlar + bildirimler + kullanıcı */}
      <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
        <Link
          href={`${portal.basePath}/mesajlar`}
          aria-label={`Mesajlar${unreadMsgs > 0 ? ` (${unreadMsgs} okunmamış)` : ""}`}
          className="relative flex size-10 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/10 hover:text-white"
        >
          <MessageSquare className="size-5" aria-hidden />
          {unreadMsgs > 0 ? (
            <span className="absolute top-1.5 right-1.5 flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
              {unreadMsgs > 9 ? "9+" : unreadMsgs}
            </span>
          ) : null}
        </Link>

        <NotificationBell onDark />

        {user ? (
          <Dropdown>
            <DropdownButton
              plain
              aria-label="Hesap menüsü"
              className="!px-2 hover:!bg-white/10"
            >
              <span className="flex items-center gap-2.5">
                <Avatar
                  square
                  initials={initialsOf(user.firstName, user.lastName)}
                  className="size-8 bg-white/15 text-white ring-1 ring-white/20"
                  alt=""
                />
                <span className="hidden text-left md:block">
                  <span className="block max-w-40 truncate text-sm font-semibold text-white">
                    {user.firstName} {user.lastName}
                  </span>
                  <span className="block text-[11px] leading-tight text-zinc-400">
                    {user.isOwner ? "Firma Sahibi" : (company?.name ?? "")}
                  </span>
                </span>
                <ChevronDownIcon className="hidden size-4 text-zinc-500 md:block" />
              </span>
            </DropdownButton>
            <DropdownMenu className="min-w-64" anchor="bottom end">
              <div className="px-3.5 pt-2.5 pb-2">
                <p className="text-sm font-semibold text-zinc-900">
                  {user.firstName} {user.lastName}
                  {user.isOwner ? (
                    <span className="text-amber-600"> · Sahip</span>
                  ) : null}
                </p>
                <p className="truncate text-xs text-zinc-500">{user.email}</p>
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
