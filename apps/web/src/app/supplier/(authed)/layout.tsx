"use client";

import { RequireSupplierAuth } from "@/components/providers/supplier-auth-hydration";
import { SupplierShell } from "@/components/supplier-shell/shell";

export default function SupplierAuthedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireSupplierAuth>
      <SupplierShell>{children}</SupplierShell>
    </RequireSupplierAuth>
  );
}
