"use client";

import { AdminLogo } from "@/components/brand/admin-logo";
import { Button } from "@/components/ui/button";
import { useAdminAuth, useAdminLogout } from "@/hooks/use-admin-auth";
import { useBuyerApplicationStats } from "@/hooks/use-buyer-applications";
import { useDemoRequestStats } from "@/hooks/use-demo-requests";
import { useSupplierApplicationStats } from "@/hooks/use-supplier-applications";
import { cn } from "@/lib/utils";
import {
  Building2,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Mail,
  Settings,
  Truck,
  UserCog,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type BadgeKey =
  | "demoRequestsNew"
  | "buyerAppsReview"
  | "supplierAppsReview";

interface NavLeaf {
  type?: "leaf";
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  /** Pathname'in match olacağı prefix; verilmezse exact href */
  activeMatch?: string;
  badgeKey?: BadgeKey;
}

interface NavGroup {
  type: "group";
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  children: NavLeaf[];
}

type NavItem = NavLeaf | NavGroup;

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
  {
    label: "Demo Talepleri",
    href: "/admin/demo-requests",
    icon: UserCog,
    activeMatch: "/admin/demo-requests",
    badgeKey: "demoRequestsNew",
  },
  {
    type: "group",
    label: "Başvurular",
    icon: ClipboardList,
    children: [
      {
        label: "Alıcı Başvuruları",
        href: "/admin/buyer-applications",
        icon: Building2,
        activeMatch: "/admin/buyer-applications",
        badgeKey: "buyerAppsReview",
      },
      {
        label: "Tedarikçi Başvuruları",
        href: "/admin/supplier-applications",
        icon: Truck,
        activeMatch: "/admin/supplier-applications",
        badgeKey: "supplierAppsReview",
      },
    ],
  },
  {
    label: "E-posta Logları",
    href: "/admin/email-logs",
    icon: Mail,
    activeMatch: "/admin/email-logs",
  },
  {
    label: "Müşteri Firmaları",
    href: "/admin/tenants",
    icon: Building2,
    disabled: true,
  },
  {
    label: "Tedarikçiler",
    href: "/admin/suppliers",
    icon: Truck,
    disabled: true,
  },
  {
    label: "Ayarlar",
    href: "/admin/settings",
    icon: Settings,
    disabled: true,
  },
];

function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-danger-500 text-white text-[11px] font-semibold">
      {count}
    </span>
  );
}

interface NavLeafProps {
  item: NavLeaf;
  pathname: string | null;
  badgeCount: number;
  /** Group altındaki child mı? — sol padding farklı */
  nested?: boolean;
}

function NavLeafItem({ item, pathname, badgeCount, nested }: NavLeafProps) {
  const Icon = item.icon;
  const matchPath = item.activeMatch ?? item.href;
  const active = !!pathname && pathname.startsWith(matchPath);

  const baseClasses = cn(
    "admin-sidebar-item",
    active && "admin-sidebar-item-active",
    item.disabled && "opacity-50 cursor-not-allowed",
    nested && "pl-8",
  );

  if (item.disabled) {
    return (
      <span className={baseClasses} title="Yakında" aria-disabled>
        <Icon className="w-4 h-4" />
        <span className="flex-1">{item.label}</span>
        <span className="text-[10px] text-admin-sidebar-muted uppercase tracking-wide">
          Yakında
        </span>
      </span>
    );
  }

  return (
    <Link href={item.href} className={baseClasses}>
      <Icon className="w-4 h-4" />
      <span className="flex-1">{item.label}</span>
      <CountBadge count={badgeCount} />
    </Link>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { admin } = useAdminAuth();
  const logout = useAdminLogout();
  const pathname = usePathname();

  const demoStats = useDemoRequestStats();
  const buyerStats = useBuyerApplicationStats();
  const supplierStats = useSupplierApplicationStats();

  const initials = admin
    ? `${admin.firstName[0] ?? ""}${admin.lastName[0] ?? ""}`.toUpperCase()
    : "??";

  const counts: Record<BadgeKey, number> = {
    demoRequestsNew: demoStats.data?.byStatus.NEW ?? 0,
    buyerAppsReview: buyerStats.data?.byStatus.PENDING_REVIEW ?? 0,
    supplierAppsReview: supplierStats.data?.byStatus.PENDING_REVIEW ?? 0,
  };

  return (
    <div className="min-h-screen flex bg-admin-bg">
      <aside
        className="w-60 shrink-0 bg-admin-sidebar text-admin-sidebar-text flex flex-col"
        style={{ boxShadow: "var(--shadow-sidebar)" }}
      >
        <div className="px-5 py-5 border-b border-white/5">
          <AdminLogo variant="light" size="md" badge priority />
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            if (item.type === "group") {
              const Icon = item.icon;
              const groupTotal = item.children.reduce(
                (sum, c) => sum + (c.badgeKey ? counts[c.badgeKey] : 0),
                0,
              );
              return (
                <div key={item.label} className="pt-2">
                  <div className="flex items-center gap-3 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-admin-sidebar-muted">
                    <Icon className="w-3.5 h-3.5" />
                    <span className="flex-1">{item.label}</span>
                    <CountBadge count={groupTotal} />
                  </div>
                  <div className="space-y-0.5 mt-1">
                    {item.children.map((child) => (
                      <NavLeafItem
                        key={child.href}
                        item={child}
                        pathname={pathname}
                        badgeCount={
                          child.badgeKey ? counts[child.badgeKey] : 0
                        }
                        nested
                      />
                    ))}
                  </div>
                </div>
              );
            }

            return (
              <NavLeafItem
                key={item.href}
                item={item}
                pathname={pathname}
                badgeCount={item.badgeKey ? counts[item.badgeKey] : 0}
              />
            );
          })}
        </nav>

        <div className="px-4 py-4 border-t border-white/5 text-xs text-admin-sidebar-muted">
          © 2026 Supkeys
          <div className="mt-1 font-mono text-[10px] opacity-70">
            v0.0.1 — admin
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-admin-surface border-b border-admin-border px-6 py-3 flex items-center justify-between">
          <div className="text-sm text-admin-text-muted">
            Platform yönetim paneli
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden md:flex flex-col items-end leading-tight">
              <span className="text-sm font-medium text-admin-text">
                {admin?.firstName} {admin?.lastName}
              </span>
              <span className="text-xs text-admin-text-muted">
                {admin?.role}
              </span>
            </div>
            <div
              className="w-9 h-9 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-semibold text-sm"
              aria-hidden
            >
              {initials || "?"}
            </div>
            <Button variant="secondary" size="sm" onClick={logout}>
              <LogOut className="w-4 h-4" />
              Çıkış
            </Button>
          </div>
        </header>

        <main className="flex-1 px-6 py-8 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
