"use client";

import { AdminLogo } from "@/components/brand/admin-logo";
import { Avatar } from "@/components/catalyst/avatar";
import {
  Dropdown,
  DropdownButton,
  DropdownDivider,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from "@/components/catalyst/dropdown";
import { GlobalSearch } from "@/components/layout/global-search";
import { useAdminAuth, useAdminLogout } from "@/hooks/use-admin-auth";
import type { AdminRole } from "@/lib/auth/types";
import { ADMIN_ROLE_LABEL } from "@/lib/terms";
import { cn } from "@/lib/utils";
import {
  ArrowRightStartOnRectangleIcon,
  ChevronDownIcon,
  Cog6ToothIcon,
} from "@heroicons/react/20/solid";
import * as Headless from "@headlessui/react";
import {
  Activity,
  BadgeDollarSign,
  Building2,
  Flag,
  FolderTree,
  Inbox,
  LayoutDashboard,
  Mail,
  Megaphone,
  Pin,
  PinOff,
  ScrollText,
  Settings,
  ShieldAlert,
  UserCog,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/** Ray genişlikleri — müşteri paneliyle birebir (72px ↔ 256px). */
const RAIL = "4.5rem";
const RAIL_EXPANDED = "16rem";
const PIN_KEY = "rothern-admin-sidebar-pinned";

interface NavLeaf {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Pathname'in match olacağı prefix; verilmezse exact href */
  activeMatch?: string;
  /** Görecek roller — verilmezse herkes. BE guard asıl sınır; bu UX. */
  roles?: AdminRole[];
}

interface NavSection {
  heading?: string;
  items: NavLeaf[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { label: "Genel Bakış", href: "/admin/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    heading: "Operasyon",
    items: [
      {
        label: "Başvurular",
        href: "/admin/basvurular",
        icon: Inbox,
        activeMatch: "/admin/basvurular",
        // Doğrulama detayı (PII) Destek rolüne kapalı — kuyruk da gizlenir.
        roles: ["SUPER_ADMIN", "SALES"],
      },
      {
        label: "Firmalar",
        href: "/admin/firmalar",
        icon: Building2,
        activeMatch: "/admin/firmalar",
      },
      {
        label: "Şikayetler",
        href: "/admin/sikayetler",
        icon: Flag,
        activeMatch: "/admin/sikayetler",
      },
      {
        label: "Üyelik Raporu",
        href: "/admin/uyelik-raporu",
        icon: BadgeDollarSign,
        activeMatch: "/admin/uyelik-raporu",
        roles: ["SUPER_ADMIN", "SALES"],
      },
      {
        label: "Duyuru",
        href: "/admin/duyuru",
        icon: Megaphone,
        activeMatch: "/admin/duyuru",
        roles: ["SUPER_ADMIN"],
      },
    ],
  },
  {
    heading: "Yönetim",
    items: [
      {
        label: "E-posta Kayıtları",
        href: "/admin/email-logs",
        icon: Mail,
        activeMatch: "/admin/email-logs",
      },
      {
        label: "Denetim Kaydı",
        href: "/admin/audit-logs",
        icon: ScrollText,
        activeMatch: "/admin/audit-logs",
        roles: ["SUPER_ADMIN", "SALES"],
      },
      {
        label: "Güvenlik",
        href: "/admin/guvenlik",
        icon: ShieldAlert,
        activeMatch: "/admin/guvenlik",
        roles: ["SUPER_ADMIN", "SALES"],
      },
      {
        label: "Personel",
        href: "/admin/personel",
        icon: UserCog,
        activeMatch: "/admin/personel",
        roles: ["SUPER_ADMIN"],
      },
      {
        label: "Sistem Sağlığı",
        href: "/admin/sistem",
        icon: Activity,
        activeMatch: "/admin/sistem",
      },
      {
        label: "Kategoriler",
        href: "/admin/kategoriler",
        icon: FolderTree,
        activeMatch: "/admin/kategoriler",
      },
    ],
  },
];

function initialsOf(first?: string | null, last?: string | null) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?";
}

/** Tekil ray satırı — müşteri panelindeki RailItem'in zinc-aksan portu. */
function RailItem({
  href,
  icon: Icon,
  label,
  active,
  expanded,
  onClick,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  expanded: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      title={expanded ? undefined : label}
      className={cn(
        "group/item relative flex h-10 items-center gap-3 rounded-lg px-2.5 text-sm font-medium transition-colors",
        active
          ? "bg-zinc-100 text-zinc-900"
          : "text-zinc-600 hover:bg-zinc-950/5 hover:text-zinc-900",
      )}
    >
      {active ? (
        <span
          className="absolute top-1/2 left-0 h-5 w-1 -translate-y-1/2 rounded-r-full bg-zinc-700"
          aria-hidden
        />
      ) : null}
      <span className="ml-0.5 shrink-0">
        <Icon className="size-5" aria-hidden />
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate whitespace-nowrap transition-opacity duration-150",
          expanded ? "opacity-100" : "opacity-0",
        )}
      >
        {label}
      </span>
    </Link>
  );
}

/** Ray içeriği — masaüstünde hover'da genişler, mobil çekmecede hep geniş. */
function AdminSidebarContent({
  expanded,
  showPin = true,
  pinned,
  onTogglePin,
  onNavigate,
}: {
  expanded: boolean;
  showPin?: boolean;
  pinned: boolean;
  onTogglePin: () => void;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { admin } = useAdminAuth();

  const visibleSections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) =>
        !item.roles || (admin?.role && item.roles.includes(admin.role)),
    ),
  })).filter((s) => s.items.length > 0);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <nav className="mt-3 flex-1 space-y-0.5 overflow-x-hidden overflow-y-auto px-2">
        {visibleSections.map((section, i) => (
          <div key={section.heading ?? `s-${i}`}>
            {i > 0 ? (
              <div className="mx-1 my-2 h-px bg-zinc-100" aria-hidden />
            ) : null}
            {section.heading ? (
              <p
                className={cn(
                  "px-2.5 pt-1 pb-1 text-[11px] font-bold tracking-wider text-zinc-400 uppercase transition-opacity duration-150",
                  expanded ? "opacity-100" : "opacity-0",
                )}
              >
                {section.heading}
              </p>
            ) : null}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const matchPath = item.activeMatch ?? item.href;
                return (
                  <RailItem
                    key={item.href}
                    href={item.href}
                    icon={item.icon}
                    label={item.label}
                    active={!!pathname && pathname.startsWith(matchPath)}
                    expanded={expanded}
                    onClick={onNavigate}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Alt: Ayarlar + pin — müşteri panelindeki yerleşimle aynı. */}
      <div className="space-y-0.5 border-t border-zinc-100 px-2 py-2">
        <RailItem
          href="/admin/settings"
          icon={Settings}
          label="Ayarlar"
          active={pathname?.startsWith("/admin/settings") ?? false}
          expanded={expanded}
          onClick={onNavigate}
        />
        {showPin ? (
          <button
            type="button"
            onClick={onTogglePin}
            title={pinned ? "Menüyü serbest bırak" : "Menüyü sabitle"}
            className="flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-950/5 hover:text-zinc-700"
          >
            <span className="ml-0.5 shrink-0">
              {pinned ? (
                <PinOff className="size-4.5" aria-hidden />
              ) : (
                <Pin className="size-4.5" aria-hidden />
              )}
            </span>
            <span
              className={cn(
                "truncate whitespace-nowrap transition-opacity duration-150",
                expanded ? "opacity-100" : "opacity-0",
              )}
            >
              {pinned ? "Sabitlemeyi kaldır" : "Menüyü sabitle"}
            </span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Üst çubuk — beyaz; solda logo + rol rozeti, ortada global arama, sağda hesap. */
function AdminTopbar({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
  const { admin } = useAdminAuth();
  const logout = useAdminLogout();

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

      {/* Logo + ADMIN rozeti */}
      <Link href="/admin/dashboard" className="flex shrink-0 items-center">
        <AdminLogo variant="dark" size="sm" badge priority />
      </Link>

      {/* Rol kimliği */}
      {admin ? (
        <div className="hidden min-w-0 items-center gap-2.5 sm:flex">
          <div className="h-6 w-px bg-zinc-200" aria-hidden />
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase",
              admin.role === "SUPER_ADMIN"
                ? "bg-amber-100 text-amber-700"
                : "bg-zinc-100 text-zinc-600",
            )}
          >
            {ADMIN_ROLE_LABEL[admin.role] ?? admin.role}
          </span>
        </div>
      ) : null}

      {/* Orta: global arama */}
      <div className="flex flex-1 justify-center px-2">
        <GlobalSearch />
      </div>

      {/* Sağ: hesap */}
      <div className="flex shrink-0 items-center gap-1">
        {admin ? (
          <Dropdown>
            <DropdownButton plain aria-label="Hesap menüsü" className="!px-2">
              <span className="flex items-center gap-2.5">
                <Avatar
                  square
                  initials={initialsOf(admin.firstName, admin.lastName)}
                  className="size-8 bg-zinc-900 text-white"
                  alt=""
                />
                <span className="hidden text-left md:block">
                  <span className="block max-w-40 truncate text-sm font-semibold text-zinc-900">
                    {admin.firstName} {admin.lastName}
                  </span>
                  <span className="block text-[11px] leading-tight text-zinc-500">
                    {ADMIN_ROLE_LABEL[admin.role] ?? admin.role}
                  </span>
                </span>
                <ChevronDownIcon className="hidden size-4 text-zinc-400 md:block" />
              </span>
            </DropdownButton>
            <DropdownMenu className="min-w-64" anchor="bottom end">
              <div className="col-span-full px-3.5 pt-2.5 pb-2">
                <p className="text-sm font-semibold text-zinc-900">
                  {admin.firstName} {admin.lastName}
                </p>
                <p className="truncate text-xs text-zinc-400">{admin.email}</p>
              </div>
              <DropdownDivider />
              <DropdownItem href="/admin/settings">
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

/**
 * Admin shell — müşteri panelinin (CompanyShell) birebir mimarisi:
 * beyaz topbar + hover'da genişleyen ikon rayı (pin'lenebilir) + zinc-50
 * zemin üzerinde beyaz içerik kartı.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Pin tercihi kalıcı (localStorage) — hydration uyumu için effect'te okunur.
  useEffect(() => {
    setPinned(localStorage.getItem(PIN_KEY) === "1");
  }, []);
  const togglePin = () => {
    setPinned((prev) => {
      localStorage.setItem(PIN_KEY, prev ? "0" : "1");
      return !prev;
    });
  };

  const expanded = pinned || hovered;

  return (
    <div className="min-h-svh bg-zinc-50">
      <AdminTopbar onOpenMobileNav={() => setMobileOpen(true)} />

      {/* Masaüstü rayı */}
      <aside
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ width: expanded ? RAIL_EXPANDED : RAIL }}
        className="fixed top-14 bottom-0 left-0 z-30 hidden border-r border-zinc-950/10 bg-white transition-[width] duration-200 ease-out lg:block"
      >
        <AdminSidebarContent
          expanded={expanded}
          pinned={pinned}
          onTogglePin={togglePin}
        />
      </aside>

      {/* Mobil çekmece */}
      <Headless.Dialog
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        className="lg:hidden"
      >
        <Headless.DialogBackdrop
          transition
          className="fixed inset-0 z-40 bg-black/30 transition data-closed:opacity-0 data-enter:duration-300 data-enter:ease-out data-leave:duration-200 data-leave:ease-in"
        />
        <Headless.DialogPanel
          transition
          className="fixed inset-y-0 left-0 z-50 w-full max-w-72 bg-white shadow-xl transition duration-300 ease-in-out data-closed:-translate-x-full"
        >
          <div className="flex h-14 items-center justify-between border-b border-zinc-100 px-4">
            <span className="text-sm font-semibold text-zinc-900">
              Yönetim Paneli
            </span>
            <Headless.CloseButton
              aria-label="Menüyü kapat"
              className="flex size-9 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-950/5 hover:text-zinc-900"
            >
              <X className="size-5" aria-hidden />
            </Headless.CloseButton>
          </div>
          <div className="h-[calc(100%-3.5rem)]">
            <AdminSidebarContent
              expanded
              showPin={false}
              pinned={pinned}
              onTogglePin={togglePin}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        </Headless.DialogPanel>
      </Headless.Dialog>

      {/* İçerik — beyaz kart deseni (müşteri paneliyle aynı). */}
      <main
        className={cn(
          "flex min-h-svh flex-col pt-14 transition-[padding] duration-200 ease-out",
          expanded ? "lg:pl-64" : "lg:pl-[4.5rem]",
        )}
      >
        <div className="flex grow flex-col p-2 pt-2">
          <div className="grow rounded-xl bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 lg:p-10">
            <div className="mx-auto w-full max-w-7xl">{children}</div>
          </div>
        </div>
      </main>
    </div>
  );
}
