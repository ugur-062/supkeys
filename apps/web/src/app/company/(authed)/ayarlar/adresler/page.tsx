"use client";

import {
  useCompanyAuth,
  useHasCompanyPermission,
} from "@/hooks/use-company-auth";
import { AddressBookSection } from "../_components/address-book-section";
import { SettingsShell } from "../_components/settings-shell";

export default function Page() {
  const { user } = useCompanyAuth();
  const canEdit = useHasCompanyPermission("company:manage");
  return (
    <SettingsShell
      title="Adres Yönetimi"
      description="Fatura ve teslimat adreslerini yönetin."
    >
      <AddressBookSection canManage={canEdit} />
    </SettingsShell>
  );
}
