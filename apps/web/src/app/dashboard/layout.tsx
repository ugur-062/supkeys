"use client";

import { DashboardShell } from "@/components/dashboard/shell";
import { RequireAuth } from "@/components/providers/auth-hydration";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireAuth>
      <DashboardShell>{children}</DashboardShell>
    </RequireAuth>
  );
}
