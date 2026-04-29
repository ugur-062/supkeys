"use client";

import { useAdminAuthStore } from "@/lib/auth/store";
import { useEffect } from "react";

export default function RootPage() {
  const { token, isHydrated } = useAdminAuthStore();

  useEffect(() => {
    if (!isHydrated) return;
    window.location.replace(token ? "/admin/dashboard" : "/admin/login");
  }, [isHydrated, token]);

  return null;
}
