"use client";

import { CompanyShell } from "@/components/company-shell/shell";
import { RequireCompanyAuth } from "@/components/providers/company-auth-hydration";
import { ConfirmProvider } from "@/components/providers/confirm-dialog";
import { RealtimeProvider } from "@/components/providers/realtime-provider";

export default function CompanyAuthedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireCompanyAuth>
      <RealtimeProvider>
        <ConfirmProvider>
          <CompanyShell>{children}</CompanyShell>
        </ConfirmProvider>
      </RealtimeProvider>
    </RequireCompanyAuth>
  );
}
