import { BackToSettings } from "../_components/back-to-settings";
import { NotificationSection } from "../_components/notification-section";

export const metadata = {
  title: "Bildirim Tercihleri — Ayarlar",
};

export default function BildirimTercihleriPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <BackToSettings />
      <div className="mt-4">
        <NotificationSection />
      </div>
    </div>
  );
}
