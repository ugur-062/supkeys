"use client";

import {
  useCompanyAuth,
  useHasCompanyPermission,
} from "@/hooks/use-company-auth";
import { usePortalStore } from "@/lib/company/portal-store";
import { accessiblePortals } from "@/lib/company/portals";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function CompanyHome() {
  const { user, company } = useCompanyAuth();
  const router = useRouter();
  const lastPortal = usePortalStore((s) => s.lastPortal);
  const canAct = useHasCompanyPermission("approval:act");

  useEffect(() => {
    if (!user) return;
    const available = accessiblePortals(user.roles, company?.tier);
    const target =
      lastPortal && available.includes(lastPortal)
        ? lastPortal
        : (available[0] ?? null);
    // Panel erişimi olmayan üye: onaylayıcı işine (Onaylar), rolsüz Ayarlar'a.
    router.replace(
      target
        ? `/company/${target}`
        : canAct
          ? "/company/onaylar"
          : "/company/ayarlar",
    );
  }, [user, company?.tier, lastPortal, canAct, router]);

  return <div className="p-8 text-sm text-zinc-400">Yönlendiriliyor…</div>;
}
