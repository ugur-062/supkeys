"use client";

import { AccountInfoSection } from "../_components/account-settings-section";
import { SettingsShell } from "../_components/settings-shell";

export default function Page() {
  return (
    <SettingsShell
      title="Hesap Bilgileri"
      description="Ad, soyad ve iletişim bilgileriniz."
    >
      <AccountInfoSection />
    </SettingsShell>
  );
}
