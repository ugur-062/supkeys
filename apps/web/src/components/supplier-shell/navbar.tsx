"use client";

import { HeaderMessagesDropdown } from "@/components/messaging/header-messages-dropdown";
import { Navbar, NavbarSection, NavbarSpacer } from "@/components/catalyst/navbar";
import { getSupplierBreadcrumb } from "@/lib/supplier/nav-config";
import { usePathname } from "next/navigation";

/**
 * Mobil üst bar (Catalyst SidebarLayout `navbar` slot'u). Hamburger'ı layout
 * sağlar; burada başlık + mesaj erişimi var. Desktop'ta gizli.
 */
export function SupplierNavbar() {
  const pathname = usePathname();
  const breadcrumb = pathname ? getSupplierBreadcrumb(pathname) : "—";

  return (
    <Navbar>
      <span className="truncate text-sm font-semibold text-zinc-950">
        {breadcrumb}
      </span>
      <NavbarSpacer />
      <NavbarSection>
        <HeaderMessagesDropdown surface="supplier" />
      </NavbarSection>
    </Navbar>
  );
}
