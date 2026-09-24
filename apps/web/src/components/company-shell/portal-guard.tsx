"use client";

import { useNavLabel, useRoleLabel } from "@/i18n/domain";
import { useTranslations } from "next-intl";
import { userHasPermission } from "@/lib/company/permissions";
import { BUYING_TIER, tierAtLeast } from "@rothern/shared";
import { PremiumGate } from "@/components/company-shell/premium-gate";
import { useCompanyAuth, useHasCompanyPermission } from "@/hooks/use-company-auth";
import { usePortalStore } from "@/lib/company/portal-store";
import { accessiblePortals, PORTALS, type PortalKey } from "@/lib/company/portals";
import { Lock } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useEffect } from "react";


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
  const t = useTranslations("web.panel.shell.portalGuard");
  const { user, company } = useCompanyAuth();
  const setLastPortal = usePortalStore((s) => s.setLastPortal);

  const available = user ? accessiblePortals(user, company?.tier) : [];
  const allowed = available.includes(portal);
  // Satınalma görüntüleme izni var ama kademe < GOLD (satınalma paneli) → paket kapısı.
  const hasPurchasingRole = userHasPermission(user, "buy:view");
  const premiumLocked =
    portal === "satinalma" &&
    !allowed &&
    hasPurchasingRole &&
    !tierAtLeast(company?.tier ?? "STANDART", BUYING_TIER);

  useEffect(() => {
    if (user && allowed) setLastPortal(portal);
  }, [user, allowed, portal, setLastPortal]);

  if (!user) {
    return <div className="p-8 text-sm text-zinc-400">{t("yukleniyor")}</div>;
  }
  if (premiumLocked) return <PremiumGate requiredTier="GOLD" />;
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
  const t = useTranslations("web.panel.shell.portalGuard");
  const tn = useNavLabel();
  const roleLabel = useRoleLabel();
  const label = tn(PORTALS[portal].label);
  // Portala girmek için gereken operasyon rolü (Kurucu/Yönetici her ikisini de kapsar).
  const requiredRole = roleLabel(PORTALS[portal].role);
  // Onaylayıcı kendi işine yönlensin (panel-dönüş linki yoksa asıl hedefi).
  const canAct = useHasCompanyPermission("approval:act");
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100">
        <Lock className="h-5 w-5 text-zinc-500" aria-hidden="true" />
      </div>
      <h1 className="mt-4 text-lg font-bold text-zinc-900">{t("erisimYok", { label })}</h1>
      <p className="mt-2 text-sm text-zinc-600">
        {t.rich("rolGerekli", { role: requiredRole, strong: (c) => <strong>{c}</strong> })}
      </p>
      <div className="mt-6 flex flex-col items-center gap-2">
        {fallback ? (
          <Link
            href={PORTALS[fallback].basePath}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
          >
            {t("panelineDon", { label: tn(PORTALS[fallback].label) })}
          </Link>
        ) : canAct ? (
          <Link
            href="/company/onaylar"
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
          >
            {t("onaylarAGit")}
          </Link>
        ) : null}
        <Link
          href="/company/ayarlar"
          className="text-sm font-medium text-zinc-500 hover:text-zinc-700"
        >
          {t("ayarlar")}
        </Link>
      </div>
    </div>
  );
}
