"use client";

import { SidebarLayout } from "@/components/catalyst/sidebar-layout";
import { useSupplierMe } from "@/hooks/use-supplier-auth";
import { SupplierNavbar } from "./navbar";
import { SupplierSidebar } from "./sidebar";

export function SupplierShell({ children }: { children: React.ReactNode }) {
  // Login sonrası /me'yi tazele — supplier + tenantRelations bilgisini güncel tut.
  // Hook enabled flag token varsa true; RequireSupplierAuth zaten token garantiledi.
  useSupplierMe();

  // Catalyst SidebarLayout: desktop'ta sabit sidebar, mobilde drawer + üst bar.
  // Mobil drawer açılış/kapanışını layout kendi yönetir (SidebarItem tıklanınca
  // Headless CloseButton ile kapanır).
  return (
    <SidebarLayout sidebar={<SupplierSidebar />} navbar={<SupplierNavbar />}>
      {children}
    </SidebarLayout>
  );
}
