"use client";

import { AdminLogo } from "@/components/brand/admin-logo";
import { Avatar } from "@/components/catalyst/avatar";
import { Badge } from "@/components/catalyst/badge";
import {
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from "@/components/catalyst/dropdown";
import { Navbar, NavbarSpacer } from "@/components/catalyst/navbar";
import {
  Sidebar,
  SidebarBody,
  SidebarFooter,
  SidebarHeader,
  SidebarHeading,
  SidebarItem,
  SidebarLabel,
  SidebarSection,
} from "@/components/catalyst/sidebar";
import { SidebarLayout } from "@/components/catalyst/sidebar-layout";
import { useAdminAuth, useAdminLogout } from "@/hooks/use-admin-auth";
import {
  ArrowRightStartOnRectangleIcon,
  ChevronUpIcon,
} from "@heroicons/react/20/solid";
import {
  Activity,
  Building2,
  Flag,
  LayoutDashboard,
  Link2,
  Mail,
  MessageSquare,
  ScrollText,
  Settings,
  ShieldCheck,
  Truck,
  UserCog,
} from "lucide-react";
import { usePathname } from "next/navigation";

interface NavLeaf {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  /** Pathname'in match olacağı prefix; verilmezse exact href */
  activeMatch?: string;
}

interface NavSection {
  heading?: string;
  items: NavLeaf[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    heading: "Birleşik Sistem",
    items: [
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
    ],
  },
  {
    heading: "Yönetim",
    items: [
      {
        label: "E-posta Logları",
        href: "/admin/email-logs",
        icon: Mail,
        activeMatch: "/admin/email-logs",
      },
      {
        label: "Denetim Kaydı",
        href: "/admin/audit-logs",
        icon: ScrollText,
        activeMatch: "/admin/audit-logs",
      },
      {
        label: "Sistem Sağlığı",
        href: "/admin/sistem",
        icon: Activity,
        activeMatch: "/admin/sistem",
      },
      {
        label: "Ayarlar",
        href: "/admin/settings",
        icon: Settings,
        disabled: true,
      },
    ],
  },
];

function initialsOf(first?: string | null, last?: string | null) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?";
}

function AdminSidebar() {
  const { admin } = useAdminAuth();
  const logout = useAdminLogout();
  const pathname = usePathname();

  return (
    <Sidebar>
      <SidebarHeader>
        <AdminLogo variant="dark" size="md" badge priority />
      </SidebarHeader>

      <SidebarBody>
        {NAV_SECTIONS.map((section, i) => (
          <SidebarSection key={section.heading ?? `section-${i}`}>
            {section.heading ? (
              <SidebarHeading>{section.heading}</SidebarHeading>
            ) : null}
            {section.items.map((item) => {
              const Icon = item.icon;
              const matchPath = item.activeMatch ?? item.href;
              const active = !!pathname && pathname.startsWith(matchPath);

              if (item.disabled) {
                return (
                  <SidebarItem
                    key={item.href}
                    className="cursor-not-allowed opacity-50"
                    aria-disabled
                  >
                    <Icon data-slot="icon" />
                    <SidebarLabel>{item.label}</SidebarLabel>
                    <Badge className="ml-auto" color="zinc">
                      Yakında
                    </Badge>
                  </SidebarItem>
                );
              }

              return (
                <SidebarItem key={item.href} href={item.href} current={active}>
                  <Icon data-slot="icon" />
                  <SidebarLabel>{item.label}</SidebarLabel>
                </SidebarItem>
              );
            })}
          </SidebarSection>
        ))}
      </SidebarBody>

      <SidebarFooter>
        {admin ? (
          <Dropdown>
            <DropdownButton as={SidebarItem}>
              <span className="flex min-w-0 items-center gap-3">
                <Avatar
                  square
                  initials={initialsOf(admin.firstName, admin.lastName)}
                  className="size-8 bg-zinc-900 text-white"
                  alt=""
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-zinc-950">
                    {admin.firstName} {admin.lastName}
                  </span>
                  <span className="block truncate text-xs text-zinc-500">
                    {admin.role}
                  </span>
                </span>
              </span>
              <ChevronUpIcon data-slot="icon" />
            </DropdownButton>
            <DropdownMenu className="min-w-64" anchor="top start">
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

function AdminNavbar() {
  return (
    <Navbar>
      <span className="truncate text-sm font-semibold text-zinc-950">
        Rothern Admin
      </span>
      <NavbarSpacer />
    </Navbar>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarLayout sidebar={<AdminSidebar />} navbar={<AdminNavbar />}>
      {children}
    </SidebarLayout>
  );
}
