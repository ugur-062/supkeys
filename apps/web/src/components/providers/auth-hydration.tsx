"use client";

import { useAuthStore } from "@/lib/auth/store";
import { useEffect, useState } from "react";

/**
 * Zustand persist localStorage'dan okurken kısa bir hydration süresi var.
 * Bu boundary, hydration tamamlanana kadar children'ı render etmez.
 * SSR/CSR mismatch'i önler.
 */
export function AuthHydrationBoundary({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Hydration bitene kadar minimal placeholder
  if (!mounted) {
    return null;
  }

  return <>{children}</>;
}

/**
 * Korumalı sayfalarda kullanılır.
 * Token yoksa /login'e yönlendirir.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token, isHydrated } = useAuthStore();

  useEffect(() => {
    if (isHydrated && !token) {
      window.location.href = "/login";
    }
  }, [isHydrated, token]);

  if (!isHydrated) {
    return null;
  }

  if (!token) {
    return null;
  }

  return <>{children}</>;
}
