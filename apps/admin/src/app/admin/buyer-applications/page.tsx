import { Suspense } from "react";
import { BuyerApplicationsView } from "./_components/buyer-applications-view";

export const metadata = {
  title: "Alıcı Başvuruları — Rothern Admin",
  robots: { index: false, follow: false },
};

export default function BuyerApplicationsPage() {
  return (
    <Suspense fallback={null}>
      <BuyerApplicationsView />
    </Suspense>
  );
}
