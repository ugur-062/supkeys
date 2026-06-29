"use client";

import { NotificationPrefsSection } from "../_components/account-settings-section";
import { SettingsShell } from "../_components/settings-shell";

export default function Page() {
  return (
    <SettingsShell
      title="Bildirim Tercihleri"
      description="E-posta bildirimlerinizi yönetin."
    >
      <NotificationPrefsSection />
    </SettingsShell>
  );
}
