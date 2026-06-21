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
import {
  useSupplierAuth,
  useSupplierLogout,
} from "@/hooks/use-supplier-auth";
import { MEMBERSHIP_LABEL } from "@/lib/supplier/membership";
import {
  isSupplierItemActive,
  supplierNavConfig,
} from "@/lib/supplier/nav-config";
import {
  ArrowRightStartOnRectangleIcon,
  ChatBubbleLeftRightIcon,
  ChevronUpIcon,
  Cog6ToothIcon,
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

export function SupplierSidebar() {
  const pathname = usePathname();
  const { supplier, supplierUser } = useSupplierAuth();
  const logout = useSupplierLogout();

  return (
    <Sidebar>
      {/* Firma kimliği */}
      <SidebarHeader>
        <div className="flex items-center gap-3">
          <Avatar
            square
            initials={companyInitials(supplier?.companyName)}
            className="size-10 bg-zinc-900 text-white"
            alt={supplier?.companyName ?? ""}
          />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-zinc-950">
              {supplier?.companyName ?? "—"}
            </div>
            {supplier &&
              (supplier.membership === "PREMIUM" ? (
                <span className="mt-1 inline-flex items-center rounded-md bg-gradient-to-b from-zinc-100 to-zinc-300 px-1.5 py-0.5 text-xs font-semibold text-zinc-700 ring-1 ring-zinc-400/50">
                  {MEMBERSHIP_LABEL[supplier.membership]}
                </span>
              ) : (
                <Badge className="mt-1">
                  {MEMBERSHIP_LABEL[supplier.membership]}
                </Badge>
              ))}
          </div>
        </div>
      </SidebarHeader>

      {/* Ana navigasyon */}
      <SidebarBody>
        <SidebarSection>
          {supplierNavConfig.map((item) => {
            const Icon = item.icon;
            return (
              <SidebarItem
                key={item.href}
                href={item.href}
                current={isSupplierItemActive(item.href, pathname)}
              >
                <Icon data-slot="icon" />
                <SidebarLabel>{item.label}</SidebarLabel>
              </SidebarItem>
            );
          })}
          <SidebarItem
            href="/supplier/mesajlar"
            current={isSupplierItemActive("/supplier/mesajlar", pathname)}
          >
            <ChatBubbleLeftRightIcon data-slot="icon" />
            <SidebarLabel>Mesajlar</SidebarLabel>
          </SidebarItem>
        </SidebarSection>
      </SidebarBody>

      {/* Kullanıcı menüsü */}
      <SidebarFooter>
        {supplierUser ? (
          <Dropdown>
            <DropdownButton as={SidebarItem}>
              <span className="flex min-w-0 items-center gap-3">
                <Avatar
                  square
                  initials={initialsOf(
                    supplierUser.firstName,
                    supplierUser.lastName,
                  )}
                  className="size-8 bg-zinc-900 text-white"
                  alt=""
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-zinc-950">
                    {supplierUser.firstName} {supplierUser.lastName}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {supplierUser.email}
                  </span>
                </span>
              </span>
              <ChevronUpIcon data-slot="icon" />
            </DropdownButton>
            <DropdownMenu className="min-w-64" anchor="top start">
              <DropdownItem href="/supplier/ayarlar">
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
