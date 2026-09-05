"use client";

import { userHasPermission } from "@/lib/company/permissions";
import { tierAtLeast } from "@rothern/shared";
import { PremiumGate } from "@/components/company-shell/premium-gate";
import { useCompanyAuth, useHasCompanyPermission } from "@/hooks/use-company-auth";
import { usePortalStore } from "@/lib/company/portal-store";
import { accessiblePortals, PORTALS, type PortalKey } from "@/lib/company/portals";
import { Lock } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

// Portala girmek için gereken operasyon rolü (Kurucu/Yönetici her ikisini de kapsar).
const PORTAL_REQUIRED_ROLE: Record<PortalKey, string> = {
  satinalma: "Satın Almacı",
  satis: "Satışçı",
};

/**
 * Portal erişim kapısı:
 * - Rolü uygunsa → içerik.
 * - Satınalma'ya rolü uygun ama STANDARD → Premium kapısı (PremiumGate).
 * - Rolü uygun DEĞİLSE → "erişim yetkiniz yok" ekranı (sessiz yönlendirme YOK).
 */
export function PortalGuard({
  portal,
  children,
}: {
  portal: PortalKey;
  children: React.ReactNode;
}) {
  const { user, company } = useCompanyAuth();
  const setLastPortal = usePortalStore((s) => s.setLastPortal);

  const available = user ? accessiblePortals(user, company?.tier) : [];
  const allowed = available.includes(portal);
  // Satınalma görüntüleme izni var ama kademe < SILVER → paket kapısı.
  const hasPurchasingRole = userHasPermission(user, "buy:view");
  const premiumLocked =
    portal === "satinalma" &&
    !allowed &&
    hasPurchasingRole &&
    !tierAtLeast(company?.tier ?? "STANDART", "SILVER");

  useEffect(() => {
    if (user && allowed) setLastPortal(portal);
  }, [user, allowed, portal, setLastPortal]);

  if (!user) {
    return <div className="p-8 text-sm text-zinc-400">Yükleniyor…</div>;
  }
  if (premiumLocked) return <PremiumGate />;
  if (!allowed) {
    return (
      <PortalAccessDenied portal={portal} fallback={available[0] ?? null} />
    );
  }
  return <>{children}</>;
}

/** Rol yetersizliği ekranı — kullanıcı bu panele giremez, gereken rolü söyler. */
function PortalAccessDenied({
  portal,
  fallback,
}: {
  portal: PortalKey;
  fallback: PortalKey | null;
}) {
  const label = PORTALS[portal].label;
  const requiredRole = PORTAL_REQUIRED_ROLE[portal];
  // Onaylayıcı kendi işine yönlensin (panel-dönüş linki yoksa asıl hedefi).
  const canAct = useHasCompanyPermission("approval:act");
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100">
        <Lock className="h-5 w-5 text-zinc-500" aria-hidden="true" />
      </div>
      <h1 className="mt-4 text-lg font-bold text-zinc-900">
        {label} paneline erişim yetkiniz yok
      </h1>
      <p className="mt-2 text-sm text-zinc-600">
        Bu panele girmek için <strong>{requiredRole}</strong> (veya Yönetici /
        Kurucu) rolüne sahip olmalısınız. Yetki için firma yöneticinizle
        görüşün.
      </p>
      <div className="mt-6 flex flex-col items-center gap-2">
        {fallback ? (
          <Link
            href={PORTALS[fallback].basePath}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
          >
            {PORTALS[fallback].label} paneline dön
          </Link>
        ) : canAct ? (
          <Link
            href="/company/onaylar"
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
          >
            Onaylar&apos;a Git
          </Link>
        ) : null}
        <Link
          href="/company/ayarlar"
          className="text-sm font-medium text-zinc-500 hover:text-zinc-700"
        >
          Ayarlar
        </Link>
      </div>
    </div>
  );
}
