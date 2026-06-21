"use client";

import { SidebarLayout } from "@/components/catalyst/sidebar-layout";
import { MembershipBanner } from "./membership-banner";
import { DashboardNavbar } from "./navbar";
import { Sidebar } from "./sidebar";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  // Catalyst SidebarLayout: desktop'ta sabit sidebar, mobilde drawer + üst bar.
  // Tedarikçi paneliyle birebir aynı yapı.
  return (
    <SidebarLayout sidebar={<Sidebar />} navbar={<DashboardNavbar />}>
      <MembershipBanner />
      {children}
    </SidebarLayout>
  );
}
