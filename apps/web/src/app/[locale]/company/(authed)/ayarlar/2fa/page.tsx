"use client";

import { SettingsShell } from "../_components/settings-shell";
import { SETTINGS_PAGES } from "@/lib/company/settings-pages";
import { TwoFactorSection } from "../_components/two-factor-section";

export default function Page() {
  return (
    <SettingsShell page={SETTINGS_PAGES.twoFactor}>
      <TwoFactorSection />
    </SettingsShell>
  );
}
