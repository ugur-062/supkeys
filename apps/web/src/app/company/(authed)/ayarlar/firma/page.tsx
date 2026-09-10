"use client";

import { CompanyProfileSection } from "../_components/company-profile-section";
import { SettingsShell } from "../_components/settings-shell";

export default function Page() {
  return (
    <SettingsShell
      title="Firma Bilgileri"
      description="Ticari kayıt: kimlik, unvan, adres, faaliyet tipi ve kategoriler."
    >
      <CompanyProfileSection />
    </SettingsShell>
  );
}
