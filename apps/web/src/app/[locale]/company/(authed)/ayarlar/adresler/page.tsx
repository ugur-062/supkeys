"use client";

import { useHasCompanyPermission } from "@/hooks/use-company-auth";
import { AddressBookSection } from "../_components/address-book-section";
import { SettingsShell } from "../_components/settings-shell";
import { SETTINGS_PAGES } from "@/lib/company/settings-pages";

export default function Page() {
  // Faz Y: adres defteri işlem rollerine de açık (backend addresses:manage ile birebir).
  const canEdit = useHasCompanyPermission("addresses:manage");
  return (
    <SettingsShell page={SETTINGS_PAGES.adresler}>
      <AddressBookSection canManage={canEdit} />
    </SettingsShell>
  );
}
