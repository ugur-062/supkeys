"use client";

import { useCompanyAuth } from "@/hooks/use-company-auth";
import { usePortalStore } from "@/lib/company/portal-store";
import {
  accessiblePortals,
  activePortalFromPath,
  type PortalKey,
} from "@/lib/company/portals";
import { usePathname } from "next/navigation";

/**
 * Aktif portalı türetir — kabuk (shell) ile AYNI kural: URL'den; portal-nötr
 * rotalarda (bildirimler, onaylar…) son ziyaret edilen portal; o da yoksa
 * erişilebilir ilk portal. Bildirim/mesaj portal-scope'u bunu kullanır.
 */
export function useActivePortal(): PortalKey {
  const pathname = usePathname();
  const { user, company } = useCompanyAuth();
  const lastPortal = usePortalStore((s) => s.lastPortal);
  const available = accessiblePortals(user?.roles ?? [], company?.tier);
  return (
    activePortalFromPath(pathname) ??
    (lastPortal && available.includes(lastPortal) ? lastPortal : null) ??
    available[0] ??
    "satis"
  );
}
