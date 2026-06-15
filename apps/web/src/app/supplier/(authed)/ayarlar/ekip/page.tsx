import { BackToSettings } from "../_components/back-to-settings";
import { TeamView } from "./_components/team-view";

export const metadata = {
  title: "Ekip Yönetimi — Ayarlar",
};

export default function EkipPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <BackToSettings />
      <div className="mt-4">
        <TeamView />
      </div>
    </div>
  );
}
