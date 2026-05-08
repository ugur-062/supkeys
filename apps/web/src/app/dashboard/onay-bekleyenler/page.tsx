import { Suspense } from "react";
import { OnayBekleyenlerView } from "./_components/onay-bekleyenler-view";

export const metadata = {
  title: "Onay Süreçleri — Supkeys",
};

export default function OnayBekleyenlerPage() {
  return (
    <Suspense fallback={null}>
      <OnayBekleyenlerView />
    </Suspense>
  );
}
