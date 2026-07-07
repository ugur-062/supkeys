"use client";

import { useCompanyMe } from "@/hooks/use-company-auth";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import { useEffect } from "react";

/**
 * Birleşik Company paneli için RequireAuth boundary — token yoksa
 * /company/login'e; onboarding tamamlanmadıysa /company/onboarding'e yönlendirir.
 * Onboarding sayfası (authed) DIŞINDA olduğu için bu boundary onu sarmaz → döngü yok.
 */
export function RequireCompanyAuth({
  children,
}: {
  children: React.ReactNode;
}) {
  // Oturum httpOnly cookie'de; istemci sinyali `user` (persist snapshot).
  const user = useCompanyAuthStore((s) => s.user);
  const isHydrated = useCompanyAuthStore((s) => s.isHydrated);
  const me = useCompanyMe(!!user);
  const needsOnboarding = !!me.data && !me.data.company.onboardingCompletedAt;

  useEffect(() => {
    if (!isHydrated || typeof window === "undefined") return;
    if (!user) {
      window.location.href = "/company/login";
      return;
    }
    if (needsOnboarding) {
      window.location.href = "/company/onboarding";
    }
  }, [isHydrated, user, needsOnboarding]);

  if (!isHydrated || !user) return null;
  // Onboarding gerekiyorsa panel içeriğini gösterme (yönlendiriliyor).
  if (needsOnboarding) return null;

  return <>{children}</>;
}
