"use client";

import { AccountInfoSection } from "../_components/account-settings-section";
import { LanguageSection } from "../_components/language-section";
import { SettingsShell } from "../_components/settings-shell";
import { SETTINGS_PAGES } from "@/lib/company/settings-pages";

export default function Page() {
  return (
    <SettingsShell page={SETTINGS_PAGES.hesap}>
      <div className="space-y-4">
        <AccountInfoSection />
        <LanguageSection />
      </div>
    </SettingsShell>
  );
}
