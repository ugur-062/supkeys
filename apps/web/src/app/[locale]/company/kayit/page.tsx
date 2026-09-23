import { Suspense } from "react";
import { CompanySignupClient } from "./_components/signup-client";

export const metadata = {
  title: "Kaydol",
  // Giriş/kayıt ekranı arama sonucunda görünmesin (2026-09-19 inceleme SEO-1).
  robots: { index: false, follow: true },
};

export default function CompanySignupPage() {
  return (
    <Suspense fallback={null}>
      <CompanySignupClient />
    </Suspense>
  );
}
