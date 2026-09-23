import { Suspense } from "react";
import { CompanyLoginClient } from "./_components/login-page-client";

export const metadata = {
  title: "Giriş",
  // Giriş/kayıt ekranı arama sonucunda görünmesin (2026-09-19 inceleme SEO-1).
  robots: { index: false, follow: true },
};

export default function CompanyLoginPage() {
  return (
    <Suspense fallback={null}>
      <CompanyLoginClient />
    </Suspense>
  );
}
