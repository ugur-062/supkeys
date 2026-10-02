"use client";

import { useTranslations } from "next-intl";
import { LockClosedIcon } from "@heroicons/react/20/solid";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { useHydrated } from "@/hooks/use-hydrated";
import { AccentLink } from "@/components/ui/accent-fill";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import { gateHref, publicBidGate, type BuyingGate } from "@/lib/public/member-gate";
import { PANEL_TARGET } from "@/lib/public/visibility";
import { cn } from "@/lib/utils";

/**
 * Oturumdaki üyenin herkese açık talebe teklif kapısı (istemci). Sayfa
 * statik/ISR; kapı YALNIZ hidrasyondan sonra okunur — sunucu HTML'i her zaman
 * misafir hâlidir (SEO ve #418 güvenli; `useBuyingGate` ile aynı desen).
 */
export function usePublicBidGate(): BuyingGate {
  const hydrated = useHydrated();
  const storeHydrated = useCompanyAuthStore((s) => s.isHydrated);
  const user = useCompanyAuthStore((s) => s.user);
  const company = useCompanyAuthStore((s) => s.company);
  if (!hydrated || !storeHydrated) return "guest";
  return publicBidGate(user, company);
}

/**
 * Teaser satırı/kartı "Teklif ver" eylemi (arayüz testi webA-02 yeniden
 * doğrulama): misafir → kayıt (niyet + panel dönüşü, `guestHref`); Silver ∧
 * yetki → doğrudan panel karşılığı; Silver değil → "Teklif ver · Silver"
 * doğrulama/paket sayfasına; Silver ama `sell:bid:submit` yok → `null`
 * (eylem çizilmez — paket önce, sonra izin). Eskiden yetkisiz üyeye de
 * "Teklif ver" basılıyordu, talep sayfası ise aynı kişiye yetki notu
 * veriyordu (arayüz testi son tur webA-1); dar satırda `ListingBidCta`
 * `compact` ile aynı karar: yetki notu yer kaplamaz, satırın kendisi talep
 * sayfasına (yetki notuna) gider.
 */
export function usePublicBidAction(
  number: string,
  label: string,
  guestHref: string,
): { label: string; href: string; locked: boolean } | null {
  const t = useTranslations("web.marketplace.bidGate");
  const gate = usePublicBidGate();
  if (gate === "guest") return { label, href: guestHref, locked: false };
  if (gate === "noPermission") return null;
  const href = gateHref(gate);
  if (href) return { label: t("lockedLabel", { label }), href, locked: true };
  return { label, href: PANEL_TARGET.listing(number), locked: false };
}

/**
 * HERKESE AÇIK TALEP SAYFASI TEKLİF ADACIĞI. Eskiden oturumlu ücretsiz üye de
 * "Bu talebe teklif vermek için ücretsiz kaydol" görüp kayıt → panel → Silver
 * kilidi zincirine düşüyordu; PUBLIC talebe tanımadan teklif Silver ister.
 *
 * - misafir / hidrasyon öncesi → `children` (sunucunun bastığı misafir CTA'sı)
 * - Silver ∧ `sell:bid:submit` → panelde teklif
 * - Silver değil → açıklama + doğrulama/paket (davetliler için panel bağlantısı)
 * - yetki yok → yetki notu
 *
 * `compact`: sayfa gövdesindeki kilit kutusunun yerine tek satır (kenar
 * kartındaki tam açıklamayı ikinci kez çizmez).
 */
export function ListingBidCta({
  number,
  children,
  compact = false,
  className,
}: {
  number: string;
  children: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  const t = useTranslations("web.marketplace.bidGate");
  const gate = usePublicBidGate();
  const panel = PANEL_TARGET.listing(number);
  if (gate === "guest") return <>{children}</>;

  if (gate === "ok") {
    return compact ? (
      <p className={cn("text-sm", className)}>
        <Link href={panel} className="font-semibold text-zinc-900 underline underline-offset-2 hover:text-zinc-600">
          {t("openInPanel")}
        </Link>
      </p>
    ) : (
      <AccentLink
        href={panel}
        className={cn("block rounded-full px-4 py-2.5 text-center text-sm font-semibold text-white transition", className)}
      >
        {t("bidInPanel")}
      </AccentLink>
    );
  }

  if (gate === "noPermission") {
    return compact ? null : (
      <p className={cn("rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-600", className)}>{t("noPermission")}</p>
    );
  }

  const href = gateHref(gate) as string;
  const cta = gate === "verify" ? t("verifyCta") : t("upgradeCta");
  if (compact) {
    return (
      <p className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-600", className)}>
        <LockClosedIcon aria-hidden className="size-4 shrink-0 text-zinc-400" />
        <span>{t("compactLocked")}</span>
        <Link href={href} className="font-semibold text-zinc-900 underline underline-offset-2 hover:text-zinc-600">
          {cta}
        </Link>
      </p>
    );
  }
  return (
    <div
      role="note"
      className={cn("rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950 ring-1 ring-amber-600/20", className)}
    >
      <p className="flex items-start gap-2 font-semibold">
        <LockClosedIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-amber-700" />
        {t("title")}
      </p>
      <p className="mt-1 text-xs/5 text-amber-900">{t("body")}</p>
      {gate === "verify" ? <p className="mt-1 text-xs/5 text-amber-900">{t("verifyNote")}</p> : null}
      <Link
        href={href}
        className="mt-3 inline-flex w-full items-center justify-center rounded-full bg-blue-600 px-4 py-2 text-center text-sm font-semibold text-white transition hover:bg-blue-700"
      >
        {cta}
      </Link>
      <Link href={panel} className="mt-2 block text-center text-xs font-medium text-amber-900 underline underline-offset-2">
        {t("invitedInPanel")}
      </Link>
    </div>
  );
}
