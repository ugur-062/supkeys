"use client";

import {
  useCompanyAuth,
  useHasCompanyPermission,
} from "@/hooks/use-company-auth";
import { BankAccountsSection } from "../_components/bank-accounts-section";
import { SettingsShell } from "../_components/settings-shell";

export default function Page() {
  const { user } = useCompanyAuth();
  // Banka hesabı yönetimi yalnız Kurucu (billing:manage = owner-only).
  const canEdit = useHasCompanyPermission("billing:manage");
  return (
    <SettingsShell
      title="Banka Hesapları"
      description="Sipariş onayında seçilecek ödeme hesaplarınızı yönetin."
    >
      <BankAccountsSection canManage={canEdit} />
    </SettingsShell>
  );
}
