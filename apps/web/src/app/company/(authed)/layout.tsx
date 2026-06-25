"use client";

import { CompanyShell } from "@/components/company-shell/shell";
import { RequireCompanyAuth } from "@/components/providers/company-auth-hydration";

export default function CompanyAuthedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireCompanyAuth>
      <CompanyShell>{children}</CompanyShell>
    </RequireCompanyAuth>
  );
}
