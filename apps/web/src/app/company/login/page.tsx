import { Suspense } from "react";
import { CompanyLoginClient } from "./_components/login-page-client";

export const metadata = {
  title: "Giriş — Rothern",
};

export default function CompanyLoginPage() {
  return (
    <Suspense fallback={null}>
      <CompanyLoginClient />
    </Suspense>
  );
}
