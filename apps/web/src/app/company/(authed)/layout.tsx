"use client";

import { CompanyShell } from "@/components/company-shell/shell";
import { RequireCompanyAuth } from "@/components/providers/company-auth-hydration";
import { ConfirmProvider } from "@/components/providers/confirm-dialog";

export default function CompanyAuthedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireCompanyAuth>
      <ConfirmProvider>
        <CompanyShell>{children}</CompanyShell>
      </ConfirmProvider>
    </RequireCompanyAuth>
  );
}
