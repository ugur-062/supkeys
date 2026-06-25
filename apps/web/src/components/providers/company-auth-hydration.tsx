"use client";

import { useCompanyAuthStore } from "@/lib/company-auth/store";
import { useEffect } from "react";

/**
 * Birleşik Company paneli için RequireAuth boundary — token yoksa
 * /company/login'e yönlendirir.
 */
export function RequireCompanyAuth({
  children,
}: {
  children: React.ReactNode;
}) {
  const token = useCompanyAuthStore((s) => s.token);
  const isHydrated = useCompanyAuthStore((s) => s.isHydrated);

  useEffect(() => {
    if (!isHydrated || typeof window === "undefined") return;
    if (!token) {
      window.location.href = "/company/login";
    }
  }, [isHydrated, token]);

  if (!isHydrated || !token) {
    return null;
  }

  return <>{children}</>;
}
