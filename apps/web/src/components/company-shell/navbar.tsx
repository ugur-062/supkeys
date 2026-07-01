"use client";

import {
  Navbar,
  NavbarSection,
  NavbarSpacer,
} from "@/components/catalyst/navbar";
import { getCompanyBreadcrumb } from "@/lib/company/nav-config";
import { usePathname } from "next/navigation";
import { NotificationBell } from "./notification-bell";

export function CompanyNavbar() {
  const pathname = usePathname();
  const breadcrumb = pathname ? getCompanyBreadcrumb(pathname) : "—";

  return (
    <Navbar>
      <span className="truncate text-sm font-semibold text-zinc-950">
        {breadcrumb}
      </span>
      <NavbarSpacer />
      <NavbarSection>
        <NotificationBell />
      </NavbarSection>
    </Navbar>
  );
}
