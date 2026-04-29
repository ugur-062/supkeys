import { Suspense } from "react";
import { DemoRequestsView } from "./_components/demo-requests-view";

export const metadata = {
  title: "Demo Talepleri — Supkeys Admin",
  robots: { index: false, follow: false },
};

export default function DemoRequestsPage() {
  return (
    <Suspense fallback={null}>
      <DemoRequestsView />
    </Suspense>
  );
}
