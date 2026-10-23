"use client";

import { useTranslations } from "next-intl";
import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import { userHasPermission } from "@/lib/company/permissions";
import { accentFillClass, useButtonAccent } from "@/components/ui/button-accent";
import { Button } from "@/components/catalyst/button";
import type { CompanyVerificationStatus } from "@/lib/company-auth/types";

/**
 * DOĞRULAMA KAPISI — panelin TEK kilit dili (ücretsiz dönem, 2026-10-07).
 *
 * Kullanıcı kararı: "ilk süreçte tamamen ücretsiz; doğrulanan herkes tam
 * erişimli sayılacak, doğrulama yeterli; hiçbir yerde paket adı ya da fiyat
 * yazmasın". Kapı MANTIĞI değişmedi: `/me` yanıtındaki `company.tier` artık
 * EFEKTİF kademedir (API `effective-tier.ts` — doğrulanmış firma tam erişim)
 * ve sayfalar yine `tierAtLeast(company.tier, …)` ile kapılanır. Değişen
 * yalnız kapının SÖYLEDİĞİ: "paket alın" yerine "firma doğrulaması gerekir"
 * ve tek eylem var olan doğrulama akışı (`VERIFY_HREF`).
 *
 * Durum `/me` `company.companyVerificationStatus` alanından okunur:
 *  - UNVERIFIED → "Firmanızı doğrulayın"
 *  - PENDING    → "Doğrulamanız inceleniyor" + durum bağlantısı (yeniden
 *                 belge istenmez)
 *  - REJECTED   → "Yeniden başvurun"
 *  - VERIFIED   → kapı yalnız bayat `/me` anlık görüntüsünde görünür
 *                 (onaydan hemen sonra): "sayfayı yenileyin".
 *
 * Doğrulama sayfası `company:manage` ister; bu izni taşımayan üyeye düğme
 * yerine "firma yöneticinize iletin" notu çizilir (yetki duvarına gönderilmez).
 *
 * Ücretli paketler geri geldiğinde paket ekranı git geçmişinden döner
 * (`components/company/packages/*`, `/company/premium`); bu dosya doğrulama
 * adımı olarak kalır.
 */

/** Doğrulama akışının adresi — kapıların tek hedefi. */
export const VERIFY_HREF = "/company/ayarlar/dogrulama";

const NS = "web.panel.shell.verificationGate";

/** Firma `/me` henüz gelmediyse `null` (kapı metni durum netleşince çizilir). */
export function useVerificationStatus(): CompanyVerificationStatus | null {
  return useCompanyAuthStore((s) => s.company?.companyVerificationStatus) ?? null;
}

/** Bakan kişi doğrulama başvurusunu kendisi yapabilir mi (`company:manage`). */
function useCanVerify(): boolean {
  const user = useCompanyAuthStore((s) => s.user);
  // `/me` gelmeden (user yok) düğme çizilir — yetkisiz üyeye sayfa kendi notunu gösterir.
  return !user || userHasPermission(user, "company:manage");
}

type GateKey = "unverified" | "pending" | "rejected" | "verified";

function gateKey(status: CompanyVerificationStatus | null): GateKey {
  if (status === "PENDING") return "pending";
  if (status === "REJECTED") return "rejected";
  if (status === "VERIFIED") return "verified";
  return "unverified";
}

/** Kapının duruma göre metni ve eylemi — her kilit yüzeyi aynı sözlüğü kullanır. */
export function useVerificationGateCopy(): {
  status: CompanyVerificationStatus | null;
  key: GateKey;
  /** Kısa durum cümlesi (bant/satır içi). */
  short: string;
  /** Kart/menü rozeti (2-3 sözcük); doğrulanmış firmada boş (rozet çizilmez). */
  badge: string;
  /** Açıklama paragrafı. */
  body: string;
  /** Eylem metni; `href` yoksa sayfa yenileme düğmesidir. */
  cta: string;
  href: string | null;
  /** Bakan kişi başvuruyu kendisi yapamıyorsa gösterilecek not (yoksa null). */
  managerNote: string | null;
} {
  const t = useTranslations(NS);
  const status = useVerificationStatus();
  const canVerify = useCanVerify();
  const key = gateKey(status);
  return {
    status,
    key,
    short: t(`${key}.short`),
    badge: key === "verified" ? "" : t(`${key}.badge`),
    body: t(`${key}.body`),
    cta: t(`${key}.cta`),
    href: key === "verified" ? null : VERIFY_HREF,
    managerNote: key !== "verified" && !canVerify ? t("managerNote") : null,
  };
}

const PILL = "inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold text-white transition";

/**
 * Kapının EYLEMİ — durum notu + tek düğme. Kilit kartı, sayfa kapısı ve
 * bantlar bunu paylaşır. `children`: düğmenin yanına dipnot.
 */
export function VerificationActions({
  className = "",
  children,
  hideBody = false,
}: {
  className?: string;
  children?: ReactNode;
  /** Açıklama paragrafını çağıran kendi yazdıysa gizle. */
  hideBody?: boolean;
}) {
  const copy = useVerificationGateCopy();
  // Birincil düğme PORTAL RENGİNDE (2026-09-17 kararı; arayüz testi D-284).
  const fill = accentFillClass(useButtonAccent());
  return (
    <>
      {hideBody ? null : (
        <p className="mt-3 text-sm text-zinc-700" data-testid="verification-gate-body" data-state={copy.key}>
          {copy.body}
        </p>
      )}
      {copy.managerNote ? <p className="mt-2 text-sm text-zinc-600">{copy.managerNote}</p> : null}
      <div className={`mt-4 flex flex-wrap items-center gap-3 ${className}`}>
        {copy.managerNote ? null : copy.href ? (
          <Link href={copy.href} className={`${PILL} ${fill}`}>
            {copy.cta}
          </Link>
        ) : (
          <button type="button" onClick={() => window.location.reload()} className={`${PILL} ${fill}`}>
            {copy.cta}
          </button>
        )}
        {children}
      </div>
    </>
  );
}

/**
 * BANT/EKRAN DÜĞMESİ (catalyst `Button`) — `VerificationActions`'ın düğme hali.
 * Çağıran sarmalayıcıyı (flex-wrap) kendisi verir.
 */
export function VerificationButton({ className }: { className?: string }) {
  const copy = useVerificationGateCopy();
  if (copy.managerNote) return <span className="text-sm text-zinc-600">{copy.managerNote}</span>;
  if (!copy.href) {
    return (
      <Button onClick={() => window.location.reload()} className={className}>
        {copy.cta}
      </Button>
    );
  }
  return (
    <Button href={copy.href} className={className}>
      {copy.cta}
    </Button>
  );
}

/**
 * METİN İÇİ doğrulama bağlantısı — "… doğrulanmış firmalara açıktır." cümlesinin
 * ardına. Doğrulanmış firmada hiçbir şey çizmez.
 */
export function VerificationLink({ className = "" }: { className?: string }) {
  const copy = useVerificationGateCopy();
  if (!copy.status || !copy.href) return null;
  if (copy.managerNote) return <> {copy.managerNote}</>;
  return (
    <>
      {" "}
      <Link href={copy.href} className={`font-semibold underline underline-offset-2 ${className}`}>
        {copy.cta}
      </Link>
    </>
  );
}

/**
 * KİLİT KARTI — doğrulanmamış firmanın çarptığı her kilit aynı dili konuşur
 * (açık talepler, talep detayı, bilgi talebinde alıcı kimliği…). Uydurma veri
 * yok: `meta` ve `children` çağıranın GERÇEK sayıları/örnekleridir. Tek eylem:
 * doğrulama akışı.
 */
export function VerificationLockCard({
  title,
  description,
  meta,
  children,
  footnote,
  className = "",
}: {
  title: string;
  description: string;
  /** Tek satır gerçek sayı özeti (ör. "4 kategorinizde · 3 bu hafta"). */
  meta?: string | null;
  /** Bulanık örnek satırlar gibi ek içerik (dekoratif; aria-hidden çağıranda). */
  children?: ReactNode;
  /**
   * Düğmenin yanındaki dipnot. Verilmezse davetli/bağlantılı talep notu (kartın
   * ilk kullanım yeri); `null` → dipnot yok.
   */
  footnote?: ReactNode | null;
  className?: string;
}) {
  const t = useTranslations(NS);
  const note = footnote === undefined ? t("invitedFootnote") : footnote;
  return (
    <section
      aria-label={title}
      className={`rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm ring-1 ring-zinc-950/5 ${className}`}
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-zinc-100">
          <Lock aria-hidden className="size-5 text-zinc-700" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold tracking-tight text-zinc-950">{title}</h3>
          {meta ? <p className="mt-0.5 text-sm font-medium text-zinc-700">{meta}</p> : null}
          <p className="mt-1 text-sm text-zinc-600">{description}</p>
        </div>
      </div>
      {children}
      <VerificationActions>
        {note ? <span className="text-xs text-zinc-500">{note}</span> : null}
      </VerificationActions>
    </section>
  );
}

/**
 * SAYFA KAPISI — kilitli segmentin (Raporlar, Şablonlar, Aktivite, AI
 * Kullanımı, satınalma paneli…) yerine çizilir. Paket kartları, fiyat ya da
 * paket adı YOK: başlık + duruma göre açıklama + doğrulama eylemi.
 *
 * Başlığın altındaki durum satırı yalnız başlığın SÖYLEMEDİĞİ bir şey
 * taşıdığında çizilir (inceleniyor / onaylanmadı / doğrulandı). Doğrulanmamış
 * firmada satır "Firma doğrulaması gerekir" der — başlık ("… firma
 * doğrulaması gerektirir", "… firma doğrulamasıyla açılır") bunu zaten
 * söylüyor; aynı cümle alt alta iki kez yazılıyordu (kayıt denetimi 2026-10
 * signup-tr-18).
 */
export function VerificationGate({ title }: { title?: string }) {
  const t = useTranslations(NS);
  const copy = useVerificationGateCopy();
  return (
    <div
      className="mx-auto flex max-w-xl flex-col items-center px-4 py-16 text-center"
      role="status"
      data-testid="verification-gate"
      data-state={copy.key}
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-zinc-100">
        <Lock aria-hidden className="size-5 text-zinc-600" />
      </span>
      <h1 className="mt-4 text-lg font-bold tracking-tight text-zinc-950">{title ?? t("pageTitle")}</h1>
      {copy.key === "unverified" ? null : (
        <p className="mt-1 text-sm font-semibold text-zinc-800">{copy.short}</p>
      )}
      <VerificationActions className="justify-center" />
    </div>
  );
}
