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
  Sidebar as CatalystSidebar,
  SidebarBody,
  SidebarFooter,
  SidebarHeader,
  SidebarHeading,
  SidebarItem,
  SidebarLabel,
  SidebarSection,
} from "@/components/catalyst/sidebar";
import { useApprovalPendingCount } from "@/hooks/use-approval-requests";
import { useAuth, useLogout } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { isItemActive, navConfig } from "@/lib/dashboard/nav-config";
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

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const logout = useLogout();
  const { permissions } = usePermissions();
  const canViewApprovals = permissions.includes("approval:view");
  const { data: pendingApprovals } = useApprovalPendingCount(canViewApprovals);
  const pendingCount = pendingApprovals?.count ?? 0;

  const permSet = new Set(permissions);

  return (
    <CatalystSidebar>
      {/* Firma kimliği */}
      <SidebarHeader>
        <div className="flex items-center gap-3">
          <Avatar
            square
            initials={companyInitials(user?.tenant.name)}
            className="size-10 bg-zinc-900 text-white"
            alt={user?.tenant.name ?? ""}
          />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-zinc-950">
              {user?.tenant.name ?? "—"}
            </div>
            <div className="truncate text-xs text-zinc-500">Alıcı Paneli</div>
          </div>
        </div>
      </SidebarHeader>

      {/* Ana navigasyon — gruplu */}
      <SidebarBody>
        {navConfig.map((group) => {
          const items = group.items.filter(
            (item) => !item.permission || permSet.has(item.permission),
          );
          if (items.length === 0) return null;
          return (
            <SidebarSection key={group.label}>
              <SidebarHeading>{group.label}</SidebarHeading>
              {items.map((item) => {
                const Icon = item.icon;
                const showBadge =
                  item.type === "link" &&
                  item.href === "/dashboard/onay-bekleyenler" &&
                  pendingCount > 0;
                return (
                  <SidebarItem
                    key={item.href}
                    href={item.href}
                    current={isItemActive(item.href, pathname)}
                  >
                    <Icon data-slot="icon" />
                    <SidebarLabel>{item.label}</SidebarLabel>
                    {showBadge ? (
                      <Badge className="ml-auto" color="zinc">
                        {pendingCount}
                      </Badge>
                    ) : null}
                  </SidebarItem>
                );
              })}
            </SidebarSection>
          );
        })}

        <SidebarSection>
          <SidebarItem
            href="/dashboard/mesajlar"
            current={isItemActive("/dashboard/mesajlar", pathname)}
          >
            <ChatBubbleLeftRightIcon data-slot="icon" />
            <SidebarLabel>Mesajlar</SidebarLabel>
          </SidebarItem>
        </SidebarSection>
      </SidebarBody>

      {/* Kullanıcı menüsü */}
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
                  </span>
                  <span className="block truncate text-xs text-zinc-500">
                    {user.email}
                  </span>
                </span>
              </span>
              <ChevronUpIcon data-slot="icon" />
            </DropdownButton>
            <DropdownMenu className="min-w-64" anchor="top start">
              <DropdownItem href="/dashboard/ayarlar">
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
    </CatalystSidebar>
  );
}
