import { Suspense } from "react";
import { OnboardingClient } from "./_components/onboarding-client";

export default function SupplierOnboardingPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingClient />
    </Suspense>
  );
}
