"use client";

import { useAdminAuthStore } from "@/lib/auth/store";
import { useEffect } from "react";

export default function RootPage() {
  const { admin, isHydrated } = useAdminAuthStore();

  useEffect(() => {
    if (!isHydrated) return;
    window.location.replace(admin ? "/admin/dashboard" : "/admin/login");
  }, [isHydrated, admin]);

  return null;
}
