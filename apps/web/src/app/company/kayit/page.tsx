import { Suspense } from "react";
import { CompanySignupClient } from "./_components/signup-client";

export const metadata = {
  title: "Kaydol — Rothern",
};

export default function CompanySignupPage() {
  return (
    <Suspense fallback={null}>
      <CompanySignupClient />
    </Suspense>
  );
}
