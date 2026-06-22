import { Suspense } from "react";
import { OnboardingClient } from "./_components/onboarding-client";

export default function TenantOnboardingPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingClient />
    </Suspense>
  );
}
