"use client";

import { useNavLabel, useRoleLabel } from "@/i18n/domain";
import { useTranslations } from "next-intl";
import { userHasPermission } from "@/lib/company/permissions";
import { BUYING_TIER, tierAtLeast } from "@rothern/shared";
import { VerificationButton, VerificationGate, useVerificationGateCopy } from "@/components/company/verification-gate";
import { useCompanyAuth, useHasCompanyPermission } from "@/hooks/use-company-auth";
import { useOrders } from "@/hooks/use-company-orders";
import { useTenders } from "@/hooks/use-company-tenders";
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
import { Link, usePathname } from "@/i18n/navigation";
import { useEffect } from "react";


/**
 * Portal erişim kapısı:
 * - Rolü uygunsa → içerik.
 * - Satınalma'ya rolü uygun ama efektif kademe yetmiyor (ücretsiz dönemde:
 *   firma doğrulanmamış) → doğrulama kapısı (`VerificationGate`).
 * - Rolü uygun DEĞİLSE → "erişim yetkiniz yok" ekranı (sessiz yönlendirme YOK).
 * - Satınalma erişimi olmayan firma Taleplerim ve Siparişlerim listelerini
 *   doğrulama bandıyla AÇAR — mevcut işini bitirir, yeni iş kilitli
 *   (2026-10-01 kararı T-06, arayüz testi O-008). Kapı ekranı da bu iki
 *   listeye bağlantı verir — YALNIZ firmanın gerçekten talebi ya da alım
 *   siparişi varsa (`BuyingWindDownLinks`).
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
  // Satınalma görüntüleme izni var ama efektif kademe satınalma eşiğinin altında → doğrulama kapısı.
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
        <VerificationGate title={t("windDownBaslik")} />
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
 * Satınalma erişimi olmayan firmada açık kalan satınalma listelerinin bandı:
 * neden yeni iş yapamadığını ÖNCEDEN söyler, doğrulama akışına götürür (T-06).
 */
function BuyingWindDownBanner() {
  const t = useTranslations("web.panel.shell.portalGuard");
  const copy = useVerificationGateCopy();
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
          <p className="mt-0.5 text-amber-800">
            {t("windDownAciklama")}
            {/* İnceleme/ret durumunda ne beklendiği de yazılır. */}
            {copy.key === "unverified" ? null : ` ${copy.short}`}
          </p>
        </div>
      </div>
      <div className="ml-7 shrink-0 self-start sm:ml-0 sm:self-center">
        <VerificationButton />
      </div>
    </div>
  );
}

/**
 * Doğrulama kapısı ekranının üstünde: mevcut işlere giden iki liste (T-06).
 *
 * YALNIZ mevcut işi olan firmaya çizilir (kayıt denetimi 2026-10
 * signup-tr-18): az önce kaydolmuş, hiç talebi ve siparişi olmayan firmaya
 * "mevcut talepleriniz ve siparişleriniz açık kalır" demek yanlış bir şey
 * anlatıyordu. Veri, bağlantıların götürdüğü iki listenin kendi sorgularıdır
 * (Taleplerim, Siparişlerim — alıcı tarafı); yüklenene dek ve ikisi de boşsa
 * bant yoktur, yalnız doğrulama kapısı görünür.
 */
function BuyingWindDownLinks() {
  const t = useTranslations("web.panel.shell.portalGuard");
  const tn = useNavLabel();
  const requests = useTenders();
  const orders = useOrders();
  const hasExistingWork =
    (requests.data?.length ?? 0) > 0 || (orders.data ?? []).some((o) => o.role === "buyer");
  if (!hasExistingWork) return null;
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
