"use client";

import { useSupplierMe } from "@/hooks/use-supplier-auth";
import { useSupplierSidebar } from "@/lib/supplier/use-sidebar";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { SupplierHeader } from "./header";
import { SupplierSidebar } from "./sidebar";

export function SupplierShell({ children }: { children: React.ReactNode }) {
  // Login sonrası /me'yi tazele — supplier + tenantRelations bilgisini güncel tut.
  // Hook enabled flag token varsa true; RequireSupplierAuth zaten token garantiledi.
  useSupplierMe();

  const closeMobile = useSupplierSidebar((s) => s.closeMobile);
  const pathname = usePathname();

  // Rota değiştiğinde mobil drawer'ı kapat
  useEffect(() => {
    closeMobile();
  }, [pathname, closeMobile]);

  return (
    <div className="min-h-screen flex bg-surface-subtle">
      <SupplierSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <SupplierHeader />
        <main className="flex-1 px-4 md:px-8 py-6 md:py-8">{children}</main>
      </div>
    </div>
  );
}
