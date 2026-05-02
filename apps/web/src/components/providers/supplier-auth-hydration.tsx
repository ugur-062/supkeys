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

  useEffect(() => {
    if (isHydrated && !token && typeof window !== "undefined") {
      window.location.href = "/supplier/login";
    }
  }, [isHydrated, token]);

  if (!isHydrated || !token) {
    return null;
  }

  return <>{children}</>;
}
