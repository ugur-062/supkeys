import { BanksCard } from "../../profil/_components/banks-card";
import { BackToSettings } from "../_components/back-to-settings";

export const metadata = {
  title: "Kayıtlı Bankalarım — Ayarlar",
};

export default function BankalarPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <BackToSettings />
      <div className="mt-4">
        <BanksCard />
      </div>
    </div>
  );
}
