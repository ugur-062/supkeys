"use client";

import { useSidebar } from "@/lib/dashboard/use-sidebar";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Header } from "./header";
import { Sidebar } from "./sidebar";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const closeMobile = useSidebar((s) => s.closeMobile);
  const pathname = usePathname();

  // Rota değiştiğinde mobil drawer'ı kapat
  useEffect(() => {
    closeMobile();
  }, [pathname, closeMobile]);

  return (
    <div className="min-h-screen flex bg-surface-subtle">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <main className="flex-1 px-4 md:px-8 py-6 md:py-8">{children}</main>
      </div>
    </div>
  );
}
