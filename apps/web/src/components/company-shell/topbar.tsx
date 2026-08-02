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
import { canUseMessaging, type PortalKey } from "@/lib/company/portals";
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
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toLocaleUpperCase("tr-TR") || "?";
}

/**
 * Üst çubuk — BEYAZ; açık-mod logosu. Solda Rothern logosu + firma kimliği,
 * sağda mesajlar + bildirimler + kullanıcı. Satınalma/Satış geçişi sol menünün
 * en üstünde (Anasayfa'nın üzerinde — kullanıcı isteği).
 */
const TIER_TOPBAR_LABEL: Record<string, string> = {
  STANDART: "Standart",
  BRONZ: "Bronz",
  SILVER: "Silver",
  GOLD: "Gold",
};

export function CompanyTopbar({
  activePortal,
  onOpenMobileNav,
}: {
  activePortal: PortalKey;
  onOpenMobileNav: () => void;
}) {
  const { company, user } = useCompanyAuth();
  const logout = useCompanyLogout();
  // Birleşik mesaj kutusu (2026-08-02): ikon, HERHANGİ bir işlem rolü
  // (Satın Almacı VEYA Satışçı) olana görünür; rozet iki tarafın toplamı.
  const canMessage =
    canUseMessaging(user?.roles ?? [], "satinalma") ||
    canUseMessaging(user?.roles ?? [], "satis");
  const tier = company?.tier ?? "STANDART";

  return (
    <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-3 border-b border-zinc-950/10 bg-white px-3 sm:px-4">
      {/* A11y (denetim §7.2): klavye kullanıcısı nav'ı atlayıp içeriğe geçer. */}
      <a
        href="#icerik"
        className="sr-only rounded-lg bg-zinc-950 px-3 py-1.5 text-sm font-semibold text-white focus:not-sr-only focus:absolute focus:left-3 focus:top-2.5 focus:z-50"
      >
        İçeriğe geç
      </a>
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
            "rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide",
            tier === "GOLD"
              ? "bg-amber-100 text-amber-700"
              : tier === "STANDART"
                ? "bg-zinc-100 text-zinc-600"
                : "bg-blue-100 text-blue-700",
          )}
        >
          {TIER_TOPBAR_LABEL[tier] ?? tier}
        </span>
      </div>

      {/* Sağ: mesajlar + bildirimler + kullanıcı */}
      <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
        {canMessage ? <MessagesPopover /> : null}

        {/* Zil TEK kutu (kullanıcı isteği): iki panelin bildirimleri birlikte,
            satır başına panel rozetiyle. */}
        <NotificationBell />

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
                  <span className="block text-xs leading-tight text-zinc-500">
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
