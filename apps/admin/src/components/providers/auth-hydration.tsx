"use client";

import { useAdminAuthStore } from "@/lib/auth/store";
import { useEffect, useState } from "react";

/**
 * Zustand persist localStorage hydration boundary — SSR/CSR mismatch'i önler.
 */
export function AuthHydrationBoundary({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return <>{children}</>;
}

/**
 * Korumalı admin sayfaları için. Token yoksa /admin/login'e yönlendirir.
 */
export function RequireAdminAuth({
  children,
}: {
  children: React.ReactNode;
}) {
  const { token, isHydrated } = useAdminAuthStore();

  useEffect(() => {
    if (isHydrated && !token) {
      window.location.href = "/admin/login";
    }
  }, [isHydrated, token]);

  if (!isHydrated || !token) {
    return null;
  }

  return <>{children}</>;
}
