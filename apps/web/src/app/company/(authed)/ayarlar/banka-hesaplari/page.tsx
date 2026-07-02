"use client";

import { useCompanyAuth } from "@/hooks/use-company-auth";
import { BankAccountsSection } from "../_components/bank-accounts-section";
import { SettingsShell } from "../_components/settings-shell";

export default function Page() {
  const { user } = useCompanyAuth();
  const canEdit = !!user?.roles.includes("YONETICI");
  return (
    <SettingsShell
      title="Banka Hesapları"
      description="Sipariş onayında seçilecek ödeme hesaplarınızı yönetin."
    >
      <BankAccountsSection canManage={canEdit} />
    </SettingsShell>
  );
}
