"use client";

import {
  Navbar,
  NavbarSection,
  NavbarSpacer,
} from "@/components/catalyst/navbar";
import { HeaderMessagesDropdown } from "@/components/messaging/header-messages-dropdown";
import { getBreadcrumbs } from "@/lib/dashboard/nav-config";
import { usePathname } from "next/navigation";

/**
 * Mobil üst bar (Catalyst SidebarLayout `navbar` slot'u). Hamburger'ı layout
 * sağlar; burada başlık + mesaj erişimi var. Desktop'ta gizli — tedarikçi
 * paneliyle birebir aynı.
 */
export function DashboardNavbar() {
  const pathname = usePathname();
  const breadcrumbs = getBreadcrumbs(pathname ?? "/dashboard");
  const title = breadcrumbs[breadcrumbs.length - 1] ?? "Dashboard";

  return (
    <Navbar>
      <span className="truncate text-sm font-semibold text-zinc-950">
        {title}
      </span>
      <NavbarSpacer />
      <NavbarSection>
        <HeaderMessagesDropdown surface="tenant" />
      </NavbarSection>
    </Navbar>
  );
}
