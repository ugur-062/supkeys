"use client";

import { useSupplierAuthStore } from "@/lib/supplier-auth/store";
import { useEffect } from "react";

/**
 * Tedarikçi paneli için RequireAuth boundary — token yoksa /supplier/login'e
 * yönlendirir. tenant tarafındaki RequireAuth'ın bağımsız supplier muadili.
 */
export function RequireSupplierAuth({
  children,
}: {
  children: React.ReactNode;
}) {
  const token = useSupplierAuthStore((s) => s.token);
  const isHydrated = useSupplierAuthStore((s) => s.isHydrated);
  const supplier = useSupplierAuthStore((s) => s.supplier);

  // Madde 29 — FAZ 2: onboarding tamamlanmadıysa panele girilemez.
  const onboardingPending =
    !!supplier && supplier.onboardingCompletedAt == null;

  useEffect(() => {
    if (!isHydrated || typeof window === "undefined") return;
    if (!token) {
      window.location.href = "/supplier/login";
    } else if (onboardingPending) {
      window.location.href = "/supplier/onboarding";
    }
  }, [isHydrated, token, onboardingPending]);

  if (!isHydrated || !token || onboardingPending) {
    return null;
  }

  return <>{children}</>;
}
