"use client";

import { useHasCompanyPermission } from "@/hooks/use-company-auth";
import { BankAccountsSection } from "../_components/bank-accounts-section";
import { SettingsShell } from "../_components/settings-shell";
import { SETTINGS_PAGES } from "@/lib/company/settings-pages";

export default function Page() {
  // Banka hesabı yönetimi yalnız Kurucu (billing:manage = owner-only).
  const canEdit = useHasCompanyPermission("billing:manage");
  return (
    <SettingsShell page={SETTINGS_PAGES.banka}>
      <BankAccountsSection canManage={canEdit} />
    </SettingsShell>
  );
}
