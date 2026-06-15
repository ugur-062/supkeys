import { BackToSettings } from "../_components/back-to-settings";
import { PasswordSection } from "../_components/password-section";

export const metadata = {
  title: "Şifre İşlemleri — Ayarlar",
};

export default function SifreIslemleriPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <BackToSettings />
      <div className="mt-4">
        <PasswordSection />
      </div>
    </div>
  );
}
