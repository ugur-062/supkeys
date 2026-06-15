import { AccountInfoSection } from "../_components/account-info-section";
import { BackToSettings } from "../_components/back-to-settings";

export const metadata = {
  title: "Hesap Bilgileri — Ayarlar",
};

export default function HesapBilgileriPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <BackToSettings />
      <div className="mt-4">
        <AccountInfoSection />
      </div>
    </div>
  );
}
