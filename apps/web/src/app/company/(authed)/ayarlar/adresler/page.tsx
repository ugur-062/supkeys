"use client";

import { useHasCompanyPermission } from "@/hooks/use-company-auth";
import { AddressBookSection } from "../_components/address-book-section";
import { SettingsShell } from "../_components/settings-shell";

export default function Page() {
  // Faz Y: adres defteri işlem rollerine de açık (backend addresses:manage ile birebir).
  const canEdit = useHasCompanyPermission("addresses:manage");
  return (
    <SettingsShell
      title="Adres Yönetimi"
      description="Fatura ve teslimat adreslerini yönetin."
    >
      <AddressBookSection canManage={canEdit} />
    </SettingsShell>
  );
}
