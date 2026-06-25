"use client";

import { SidebarLayout } from "@/components/catalyst/sidebar-layout";
import { useCompanyMe } from "@/hooks/use-company-auth";
import { CompanyNavbar } from "./navbar";
import { CompanySidebar } from "./sidebar";

export function CompanyShell({ children }: { children: React.ReactNode }) {
  // Login sonrası /me ile firma + roller tazelenir.
  useCompanyMe();

  return (
    <SidebarLayout sidebar={<CompanySidebar />} navbar={<CompanyNavbar />}>
      {children}
    </SidebarLayout>
  );
}
