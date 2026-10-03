"use client";

import { useTranslations } from "next-intl";
import { LockClosedIcon } from "@heroicons/react/20/solid";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { useHydrated } from "@/hooks/use-hydrated";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import { connectGate, gateHref, type BuyingGate } from "@/lib/public/member-gate";
import { cn } from "@/lib/utils";

/** Oturumdaki üyenin bağlantı daveti kapısı (hidrasyondan önce "guest"). */
export function useConnectGate(): BuyingGate {
  const hydrated = useHydrated();
  const storeHydrated = useCompanyAuthStore((s) => s.isHydrated);
  const user = useCompanyAuthStore((s) => s.user);
  const company = useCompanyAuthStore((s) => s.company);
  if (!hydrated || !storeHydrated) return "guest";
  return connectGate(user, company);
}

/**
 * HERKESE AÇIK FİRMA PROFİLİNDEKİ "BAĞLANTI İSTEĞİ GÖNDER" (arayüz testi
 * kapanış S-PUB-ADMIN). Eskiden herkese aynı giriş bağlantısıydı: oturumlu
 * ücretsiz üye paket ipucu görmeden panel firma kartına gidip orada Silver
 * kilidine çarpıyordu. Davet Silver ister (T-02) — kapı tıklamadan önce:
 *
 * - misafir / hidrasyon öncesi → `children` (sunucunun bastığı giriş bağlantısı)
 * - firmanın kendi profili → hiç (kendine davet yok; panel kartıyla aynı)
 * - Silver ∧ `connections:manage` → panel firma kartı (davet orada gönderilir)
 * - Silver değil → kilitli "… · Silver" (doğrulanmamışa önce doğrulama)
 * - yetki yok → firmayı panelde açma bağlantısı (davet eylemi sunulmaz)
 */
export function PublicConnectCta({
  companySlug,
  panelHref,
  className,
  children,
}: {
  companySlug: string;
  panelHref: string;
  className?: string;
  children: ReactNode;
}) {
  const t = useTranslations("web.marketplace.pages");
  const gate = useConnectGate();
  const ownSlug = useCompanyAuthStore((s) => s.company?.slug ?? null);
  if (gate === "guest") return <>{children}</>;
  if (ownSlug && ownSlug === companySlug) return null;
  if (gate === "ok") {
    return (
      <Link href={panelHref} className={className}>
        {t("connectCta")}
      </Link>
    );
  }
  if (gate === "noPermission") {
    return (
      <Link href={panelHref} className={className}>
        {t("connectOpenInPanel")}
      </Link>
    );
  }
  return (
    <Link
      href={gateHref(gate) as string}
      title={t("connectLockedTitle")}
      className={cn("inline-flex items-center gap-1.5", className)}
    >
      <LockClosedIcon aria-hidden className="size-4" />
      {gate === "verify" ? t("connectVerifyCta") : t("connectLockedLabel", { label: t("connectCta") })}
    </Link>
  );
}
