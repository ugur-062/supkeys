"use client";

import { useTranslations } from "next-intl";
import { LockClosedIcon } from "@heroicons/react/20/solid";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { useHydrated } from "@/hooks/use-hydrated";
import { useAccentFill } from "@/components/ui/accent-fill";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import { buyingGate, gateHref, type BuyingAction, type BuyingGate } from "@/lib/public/member-gate";
import { signupHref } from "@/lib/public/visibility";
import { cn } from "@/lib/utils";

/**
 * Oturumdaki üyenin satın alma eylemi kapısı (istemci). Herkese açık sayfalar
 * statik/ISR ve oturum tanımaz; kimlik httpOnly çerezde, UI anlık görüntüsü
 * (`user`/`company`) depoda. Kapı YALNIZ hidrasyondan sonra okunur — sunucu
 * HTML'i her zaman misafir hâlidir (SEO ve #418 güvenli).
 */
export function useBuyingGate(action: BuyingAction): BuyingGate {
  const hydrated = useHydrated();
  const storeHydrated = useCompanyAuthStore((s) => s.isHydrated);
  const user = useCompanyAuthStore((s) => s.user);
  const company = useCompanyAuthStore((s) => s.company);
  if (!hydrated || !storeHydrated) return "guest";
  return buyingGate(user, company, action);
}

/** Oturumdaki firmanın slug'ı (hidrasyondan sonra; öncesi `null`). */
function useOwnCompanySlug(): string | null {
  const hydrated = useHydrated();
  const storeHydrated = useCompanyAuthStore((s) => s.isHydrated);
  const slug = useCompanyAuthStore((s) => s.company?.slug ?? null);
  return hydrated && storeHydrated ? slug : null;
}

function OwnProductNote() {
  const t = useTranslations("web.marketplace.memberGate");
  return <p className="rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-600">{t("ownProduct")}</p>;
}

/**
 * HERKESE AÇIK CTA ADACIĞI (arayüz testi Y-03, kullanıcı kararı T-02):
 * "Bilgi iste" / "Talep aç" düğmeleri oturumu olan ama Gold olmayan üyeye
 * Gold gerektiğini TIKLAMADAN ÖNCE söyler (doğrulanmamışa önce ücretsiz
 * doğrulama, değilse Gold'a geçiş). Misafir mevcut akışı (giriş/kayıt) aynen
 * görür.
 *
 * - misafir / hidrasyon öncesi → `children` (sunucunun bastığı misafir CTA'sı)
 * - Gold ∧ izin → `member` (verilmezse `children`; giriş bağlantısı oturumlu
 *   kullanıcıyı `next`e geçirir)
 * - Gold değil → `compact` ise kilitli bağlantı, değilse açıklamalı kutu
 * - izin yok → izin notu (`compact`ta hiç çizilmez)
 * - `sellerSlug` oturumdaki firmanın kendisi → "kendi ürününüz" notu (paket ve
 *   izinden ÖNCE: kendi ürününe bilgi talebi hiçbir pakette gönderilmez; panel
 *   ve üye ürün sayfasıyla aynı kural — arayüz testi D-230, webA-03 yeniden
 *   doğrulama: herkese açık sayfa Silver satıcıya kendi ürünü için Gold
 *   satıyordu)
 */
export function MemberCta({
  action,
  children,
  member,
  sellerSlug,
  compact = false,
  compactClassName,
  compactLabel,
}: {
  action: Exclude<BuyingAction, "browse">;
  children: ReactNode;
  member?: ReactNode;
  /** Eylemin hedef firması (ürünün satıcısı) — kendi firmasıysa eylem yok. */
  sellerSlug?: string;
  /** Yüzen düğme/satır içi bağlantı gibi dar yerler: kutu yerine kilitli bağlantı. */
  compact?: boolean;
  compactClassName?: string;
  /** Kilitli bağlantının etiketi (ör. "Talep aç") — sonuna "· Gold" eklenir. */
  compactLabel?: string;
}) {
  const gate = useBuyingGate(action);
  const own = useOwnCompanySlug();
  if (gate === "guest") return <>{children}</>;
  if (sellerSlug && own === sellerSlug) {
    return compact ? null : <OwnProductNote />;
  }
  if (gate === "ok") return <>{member ?? children}</>;
  if (compact) {
    return gate === "noPermission" ? null : (
      <LockedGateLink gate={gate} action={action} className={compactClassName} label={compactLabel} />
    );
  }
  return <BuyingGateNotice gate={gate} action={action} />;
}

/** Satınalma talep sihirbazı — Gold ∧ `buy:listing:manage` üyenin "Talep aç" hedefi. */
export const NEW_REQUEST_PATH = "/company/satinalma/taleplerim/yeni";

/** Gold ∧ yetkili üyenin "Talep aç" hedefi (arama terimi ön-dolu). */
export function newRequestHref(prefill?: string): string {
  return `${NEW_REQUEST_PATH}${prefill ? `?q=${encodeURIComponent(prefill)}` : ""}`;
}

/**
 * HERKESE AÇIK "TALEP AÇ" BAĞLANTISI — dar yerler (hero şeridi, boş durum,
 * akış adımı, yüzen düğme) için TEK bileşen (arayüz testi webA-03 gözden
 * geçirme, T-02). Eskiden bu yerler çıplak `signupHref("talep")` basıyordu:
 * oturumlu üye kayıt sayfasına gidip oradan sessizce `/company`ye atılıyordu
 * — Gold olmayana önceden uyarı yoktu, Gold alıcı da sihirbaza ulaşmıyordu.
 *
 * misafir → kayıt (dönüş adresi TAŞIMAZ, Y-03) · Gold ∧ yetki → sihirbaz ·
 * Gold değil → kilitli "Talep aç · Gold" (doğrulama/paket) · yetki yok → hiç.
 */
export function OpenRequestLink({
  label,
  prefill,
  className,
  accent = false,
  trailing,
}: {
  label: string;
  /** Sihirbaza taşınan arama terimi. */
  prefill?: string;
  className?: string;
  /** Portal dolgu rengi (`AccentLink` ile aynı) — kilitli hâl de aynı rengi alır. */
  accent?: boolean;
  /** Etiketten sonra çizilen ikon (ör. ok). */
  trailing?: ReactNode;
}) {
  const fill = useAccentFill();
  const cls = accent ? cn(className, fill) : className;
  return (
    <MemberCta
      action="listing"
      compact
      compactClassName={cls}
      compactLabel={label}
      member={
        <Link href={newRequestHref(prefill)} className={cls}>
          {label}
          {trailing}
        </Link>
      }
    >
      <Link href={signupHref("talep")} className={cls}>
        {label}
        {trailing}
      </Link>
    </MemberCta>
  );
}

function LockedGateLink({
  gate,
  action,
  className,
  label,
}: {
  gate: BuyingGate;
  action: Exclude<BuyingAction, "browse">;
  className?: string;
  label?: string;
}) {
  const t = useTranslations("web.marketplace.memberGate");
  const href = gateHref(gate);
  if (!href) return null;
  return (
    <Link href={href} className={cn("inline-flex items-center gap-1.5", className)} title={action === "inquiry" ? t("inquiryTitle") : t("listingTitle")}>
      <LockClosedIcon aria-hidden className="size-4" />
      {label ? t("lockedLabel", { label }) : t("upgradeCta")}
    </Link>
  );
}

/**
 * Kapalı satın alma eyleminin açıklaması — herkese açık ürün sayfası ve
 * üyenin panel ürün sayfası aynı kutuyu çizer (ad alanı `web.marketplace`:
 * herkese açık yüzey `web.panel` okuyamaz).
 */
export function BuyingGateNotice({
  gate,
  action,
  className,
}: {
  gate: BuyingGate;
  action: Exclude<BuyingAction, "browse">;
  className?: string;
}) {
  const t = useTranslations("web.marketplace.memberGate");
  if (gate === "guest" || gate === "ok") return null;
  if (gate === "noPermission") {
    return (
      <p className={cn("rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-600", className)}>
        {action === "inquiry" ? t("noPermissionInquiry") : t("noPermissionListing")}
      </p>
    );
  }
  const href = gateHref(gate) as string;
  return (
    <div
      role="note"
      className={cn("rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950 ring-1 ring-amber-600/20", className)}
    >
      <p className="flex items-center gap-2 font-semibold">
        <LockClosedIcon aria-hidden className="size-4 shrink-0 text-amber-700" />
        {action === "inquiry" ? t("inquiryTitle") : t("listingTitle")}
      </p>
      <p className="mt-1 text-xs/5 text-amber-900">{t("body")}</p>
      {gate === "verify" ? <p className="mt-1 text-xs/5 text-amber-900">{t("verifyNote")}</p> : null}
      <Link
        href={href}
        className="mt-3 inline-flex w-full items-center justify-center rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
      >
        {gate === "verify" ? t("verifyCta") : t("upgradeCta")}
      </Link>
    </div>
  );
}

/**
 * Oturum var mı (hidrasyondan sonra) — misafir CTA'sını üyenin hedefiyle
 * değiştirir (ör. `/firmalar` "Ücretsiz üye ol / Giriş yap" → üyeye "Firma
 * dizinine git"). Paket kararı hedef sayfada (`/company/firma-dizini`).
 */
export function SessionSwap({ member, children }: { member: ReactNode; children: ReactNode }) {
  const hydrated = useHydrated();
  const storeHydrated = useCompanyAuthStore((s) => s.isHydrated);
  const user = useCompanyAuthStore((s) => s.user);
  return <>{hydrated && storeHydrated && user ? member : children}</>;
}
