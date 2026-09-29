"use client";

import { CompanyShell } from "@/components/company-shell/shell";
import { TermsAcceptanceGate } from "@/components/company/terms-acceptance-gate";
import { RequireCompanyAuth } from "@/components/providers/company-auth-hydration";
import { ConfirmProvider } from "@/components/providers/confirm-dialog";
import { RealtimeProvider } from "@/components/providers/realtime-provider";

export function CompanyAuthedLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireCompanyAuth>
      <RealtimeProvider>
        <ConfirmProvider>
          <CompanyShell>{children}</CompanyShell>
          {/* Onay izi olmayan hesap (admin eliyle eklenen üye) — derin denetim MU-04. */}
          <TermsAcceptanceGate />
        </ConfirmProvider>
      </RealtimeProvider>
    </RequireCompanyAuth>
  );
}
