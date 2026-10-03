"use client";

import { useNavLabel, useRoleLabel } from "@/i18n/domain";
import { useTranslations } from "next-intl";
import { userHasPermission } from "@/lib/company/permissions";
import { BUYING_TIER, tierAtLeast } from "@rothern/shared";
import { PremiumGate } from "@/components/company-shell/premium-gate";
import { useCompanyAuth, useHasCompanyPermission } from "@/hooks/use-company-auth";
import { usePortalStore } from "@/lib/company/portal-store";
import {
  accessiblePortals,
  BUYING_WIND_DOWN_PATHS,
  MODULE_LABELS,
  PORTAL_PASSTHROUGH_PATHS,
  PORTALS,
  type PortalKey,
} from "@/lib/company/portals";
import { Lock } from "lucide-react";
import { useUpgradeHref, useVerifyFirst } from "@/components/company/silver-lock-card";
import { Link, usePathname } from "@/i18n/navigation";
import { useEffect } from "react";


/**
 * Portal erişim kapısı:
 * - Rolü uygunsa → içerik.
 * - Satınalma'ya rolü uygun ama STANDARD → Premium kapısı (PremiumGate).
 * - Rolü uygun DEĞİLSE → "erişim yetkiniz yok" ekranı (sessiz yönlendirme YOK).
 * - Gold altındaki firma (paket düştü/bitti) Taleplerim ve Siparişlerim
 *   listelerini paket bandıyla AÇAR — mevcut işini bitirir, yeni iş kilitli
 *   (2026-10-01 kararı T-06, arayüz testi O-008). Paket kapısı ekranı da bu
 *   iki listeye bağlantı verir.
 * - Eski yönlendirici adresler (`/satinalma/mesajlar`) kapısız geçer (D-264).
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
  const pathname = usePathname() ?? "";

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

  // Yalnız yönlendirici: birleşik gelen kutusu kendi kapısını uygular.
  if (PORTAL_PASSTHROUGH_PATHS.includes(pathname)) return <>{children}</>;
  if (!user) {
    return <div className="p-8 text-sm text-zinc-400">{t("yukleniyor")}</div>;
  }
  if (premiumLocked && BUYING_WIND_DOWN_PATHS.includes(pathname)) {
    return (
      <div className="space-y-4">
        <BuyingWindDownBanner />
        {children}
      </div>
    );
  }
  if (premiumLocked) {
    return (
      <div className="space-y-4">
        <BuyingWindDownLinks />
        <PremiumGate requiredTier="GOLD" />
      </div>
    );
  }
  if (!allowed) {
    return (
      <PortalAccessDenied portal={portal} fallback={available[0] ?? null} />
    );
  }
  return <>{children}</>;
}

/**
 * Gold altındaki firmada açık kalan satınalma listelerinin bandı: neden yeni
 * iş yapamadığını ÖNCEDEN söyler, paket ekranına götürür (T-06).
 */
function BuyingWindDownBanner() {
  const t = useTranslations("web.panel.shell.portalGuard");
  const tl = useTranslations("web.panel.trade.silverLockCard");
  // Paket alımı doğrulama ister — tek kural useVerifyFirst (webC-2).
  const verifyFirst = useVerifyFirst();
  const href = useUpgradeHref();
  // Telefonda düğme metnin ALTINA iner (arayüz testi webC-2: düğme yanda
  // kalınca başlık ve açıklama kartın ~%45'lik sütununa sıkışıyordu);
  // sm ve üstünde yan yana.
  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-start"
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{t("windDownBaslik")}</p>
          <p className="mt-0.5 text-amber-800">{t("windDownAciklama")}</p>
        </div>
      </div>
      <Link
        href={href}
        className="ml-7 shrink-0 self-start rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 sm:ml-0 sm:self-center"
      >
        {verifyFirst ? tl("onceUcretsizDogrulan") : t("paketleriGor")}
      </Link>
    </div>
  );
}

/** Paket kapısı ekranının üstünde: mevcut işlere giden iki liste (T-06). */
function BuyingWindDownLinks() {
  const t = useTranslations("web.panel.shell.portalGuard");
  const tn = useNavLabel();
  return (
    <p className="mx-auto max-w-3xl rounded-xl bg-zinc-50 px-4 py-3 text-center text-sm text-zinc-600 ring-1 ring-zinc-950/5">
      {t("mevcutIslerAcik")}{" "}
      <Link href="/company/satinalma/taleplerim" className="font-semibold text-zinc-900 underline underline-offset-4">
        {tn(MODULE_LABELS.satinalma.ihalelerim)}
      </Link>
      {" · "}
      <Link href="/company/satinalma/siparisler" className="font-semibold text-zinc-900 underline underline-offset-4">
        {tn(MODULE_LABELS.satinalma.siparisler)}
      </Link>
    </p>
  );
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
