"use client";

import { SettingsShell } from "../_components/settings-shell";
import { TwoFactorSection } from "../_components/two-factor-section";

export default function Page() {
  return (
    <SettingsShell
      title="İki Adımlı Doğrulama"
      description="Authenticator uygulamasıyla ek giriş güvenliği."
    >
      <TwoFactorSection />
    </SettingsShell>
  );
}
