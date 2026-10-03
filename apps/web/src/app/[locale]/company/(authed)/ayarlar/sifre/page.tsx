"use client";

import { PasswordSection } from "../_components/account-settings-section";
import { SettingsShell } from "../_components/settings-shell";
import { SETTINGS_PAGES } from "@/lib/company/settings-pages";

export default function Page() {
  return (
    <SettingsShell page={SETTINGS_PAGES.sifre}>
      <PasswordSection />
    </SettingsShell>
  );
}
