"use client";

import { useCompanyAuth } from "@/hooks/use-company-auth";
import { usePortalStore } from "@/lib/company/portal-store";
import { accessiblePortals } from "@/lib/company/portals";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function CompanyHome() {
  const { user } = useCompanyAuth();
  const router = useRouter();
  const lastPortal = usePortalStore((s) => s.lastPortal);

  useEffect(() => {
    if (!user) return;
    const available = accessiblePortals(user.roles);
    const target =
      lastPortal && available.includes(lastPortal)
        ? lastPortal
        : (available[0] ?? null);
    router.replace(target ? `/company/${target}` : "/company/ayarlar");
  }, [user, lastPortal, router]);

  return <div className="p-8 text-sm text-zinc-400">Yönlendiriliyor…</div>;
}
