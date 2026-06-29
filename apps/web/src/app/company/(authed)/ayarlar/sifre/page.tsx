"use client";

import { PasswordSection } from "../_components/account-settings-section";
import { SettingsShell } from "../_components/settings-shell";

export default function Page() {
  return (
    <SettingsShell
      title="Şifre İşlemleri"
      description="Parolanızı güvenli bir şekilde değiştirin."
    >
      <PasswordSection />
    </SettingsShell>
  );
}
