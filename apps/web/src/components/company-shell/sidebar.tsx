"use client";

import { Avatar } from "@/components/catalyst/avatar";
import { Badge } from "@/components/catalyst/badge";
import {
  Dropdown,
  DropdownButton,
  DropdownDivider,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from "@/components/catalyst/dropdown";
import {
  Sidebar,
  SidebarBody,
  SidebarFooter,
  SidebarHeader,
  SidebarItem,
  SidebarLabel,
  SidebarSection,
} from "@/components/catalyst/sidebar";
import { useCompanyAuth, useCompanyLogout } from "@/hooks/use-company-auth";
import {
  PORTALS,
  PORTAL_ORDER,
  accessiblePortals,
  activePortalFromPath,
  isPortalItemActive,
  type PortalKey,
} from "@/lib/company/portals";
import { usePortalStore } from "@/lib/company/portal-store";
import {
  ArrowRightStartOnRectangleIcon,
  ChevronUpIcon,
  Cog6ToothIcon,
  LockClosedIcon,
} from "@heroicons/react/20/solid";
import { usePathname } from "next/navigation";

function initialsOf(first?: string | null, last?: string | null) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?";
}

function companyInitials(name?: string | null) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export function CompanySidebar() {
  const pathname = usePathname();
  const { company, user } = useCompanyAuth();
  const logout = useCompanyLogout();
  const setLastPortal = usePortalStore((s) => s.setLastPortal);
  const isPaid = company?.tier === "PAKET";

  const roles = user?.roles ?? [];
  const available = accessiblePortals(roles);
  const active: PortalKey =
    activePortalFromPath(pathname) ?? available[0] ?? "satinalma";
  const portal = PORTALS[active];

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-3">
          <Avatar
            square
            initials={companyInitials(company?.name)}
            className="size-10 bg-zinc-900 text-white"
            alt={company?.name ?? ""}
          />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-zinc-950">
              {company?.name ?? "—"}
            </div>
            <Badge className="mt-1" color={isPaid ? "amber" : "zinc"}>
              {isPaid ? "Tek Paket" : "Standart"}
            </Badge>
          </div>
        </div>

        {/* Portal switcher — yalnızca erişilebilir portallar */}
        {available.length > 1 ? (
          <div className="mt-3 grid grid-cols-2 gap-1 rounded-lg bg-zinc-100 p-1">
            {PORTAL_ORDER.filter((p) => available.includes(p)).map((p) => {
              const def = PORTALS[p];
              const on = p === active;
              return (
                <a
                  key={p}
                  href={def.basePath}
                  onClick={() => setLastPortal(p)}
                  className={`rounded-md px-2 py-1.5 text-center text-xs font-semibold transition ${
                    on
                      ? p === "satinalma"
                        ? "bg-white text-blue-700 shadow-sm"
                        : "bg-white text-emerald-700 shadow-sm"
                      : "text-zinc-500 hover:text-zinc-800"
                  }`}
                >
                  {def.label}
                </a>
              );
            })}
          </div>
        ) : (
          <div className="mt-3">
            <Badge color={portal.accent === "blue" ? "blue" : "emerald"}>
              {portal.label} Portalı
            </Badge>
          </div>
        )}
      </SidebarHeader>

      <SidebarBody>
        <SidebarSection>
          {portal.nav.map((item) => {
            const Icon = item.icon;
            const locked = item.paidOnly && !isPaid;
            return (
              <SidebarItem
                key={item.href}
                href={item.href}
                current={isPortalItemActive(item.href, pathname)}
              >
                <Icon data-slot="icon" />
                <SidebarLabel>{item.label}</SidebarLabel>
                {locked ? <LockClosedIcon data-slot="icon" /> : null}
              </SidebarItem>
            );
          })}
        </SidebarSection>
      </SidebarBody>

      <SidebarFooter>
        {user ? (
          <Dropdown>
            <DropdownButton as={SidebarItem}>
              <span className="flex min-w-0 items-center gap-3">
                <Avatar
                  square
                  initials={initialsOf(user.firstName, user.lastName)}
                  className="size-8 bg-zinc-900 text-white"
                  alt=""
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-zinc-950">
                    {user.firstName} {user.lastName}
                    {user.isOwner ? (
                      <span className="text-amber-600"> · Sahip</span>
                    ) : null}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {user.email}
                  </span>
                </span>
              </span>
              <ChevronUpIcon data-slot="icon" />
            </DropdownButton>
            <DropdownMenu className="min-w-64" anchor="top start">
              <DropdownItem href="/company/ayarlar">
                <Cog6ToothIcon data-slot="icon" />
                <DropdownLabel>Ayarlar</DropdownLabel>
              </DropdownItem>
              <DropdownDivider />
              <DropdownItem onClick={() => logout()}>
                <ArrowRightStartOnRectangleIcon data-slot="icon" />
                <DropdownLabel>Çıkış</DropdownLabel>
              </DropdownItem>
            </DropdownMenu>
          </Dropdown>
        ) : null}
      </SidebarFooter>
    </Sidebar>
  );
}
