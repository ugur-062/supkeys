"use client";

import type { ReactNode } from "react";
import {
  VERIFY_HREF,
  VerificationActions,
  VerificationButton,
  VerificationLink,
  VerificationLockCard,
  useVerificationStatus,
} from "@/components/company/verification-gate";

/**
 * GERİYE DÖNÜK ADLAR — ücretsiz dönem (2026-10-07).
 *
 * Paket çağrıları kalktı: bu dosyadaki her dışa aktarım artık DOĞRULAMA
 * kapısının (`verification-gate.tsx`) ince bir sarmalayıcısıdır. Adlar ve
 * prop'lar sayfalar derlenmeye devam etsin diye korunur; paket adı/etiketi
 * taşıyan prop'lar (`ctaLabel`, `pricingLabel`) KABUL EDİLİR ama ÇİZİLMEZ —
 * eski bir çağıran "… paketine geç" metni geçse de ekrana doğrulama eylemi
 * basılır. Yeni kod doğrudan `verification-gate.tsx` adlarını kullanır.
 *
 * Ücretli paketler geri geldiğinde eski gövde git geçmişinden döner.
 */

export { VERIFY_HREF };

/**
 * @deprecated Paketler sayfası KALDIRILDI (`/company/premium` doğrulama
 * sayfasına 308). Eski çağıranlar kırık bağlantı üretmesin diye doğrulama
 * akışının adresidir; yeni kod `VERIFY_HREF` kullanır.
 */
export const PRICING_HREF = VERIFY_HREF;

/**
 * Birincil eylem doğrulama BAŞVURUSU mu: doğrulanmamış (UNVERIFIED) ya da
 * reddedilmiş firmada true; incelemedeki (PENDING) ve doğrulanmış firmada
 * false. Anlamı değişmedi — PENDING'i ayrı metinle işleyen çağıranlar buna
 * güvenir.
 */
export function useVerifyFirst(): boolean {
  const status = useVerificationStatus();
  return !!status && status !== "VERIFIED" && status !== "PENDING";
}

/** @deprecated Kilit çağrısının tek adresi doğrulama akışıdır (`VERIFY_HREF`). */
export function useUpgradeHref(): string {
  return VERIFY_HREF;
}

/** @deprecated `VerificationButton` — `pricingLabel` çizilmez. */
export function UpgradeButtons({
  className,
}: {
  /** Yok sayılır (paket düğmesi kalktı). */
  pricingLabel?: string;
  className?: string;
}) {
  return <VerificationButton className={className} />;
}

/** @deprecated `VerificationLink`. */
export function VerifyFirstLink({ className = "" }: { className?: string }) {
  return <VerificationLink className={className} />;
}

/** @deprecated `VerificationActions` — `ctaLabel` çizilmez. */
export function UpgradeActions({
  className = "",
  children,
}: {
  /** Yok sayılır (paket düğmesi kalktı). */
  ctaLabel?: string;
  className?: string;
  children?: ReactNode;
}) {
  return <VerificationActions className={className}>{children}</VerificationActions>;
}

/** @deprecated `VerificationLockCard` — `ctaLabel` çizilmez. */
export function SilverLockCard({
  title,
  description,
  meta,
  children,
  footnote,
  className = "",
}: {
  title: string;
  description: string;
  meta?: string | null;
  children?: ReactNode;
  /** Yok sayılır (paket düğmesi kalktı). */
  ctaLabel?: string;
  footnote?: ReactNode | null;
  className?: string;
}) {
  return (
    <VerificationLockCard title={title} description={description} meta={meta} footnote={footnote} className={className}>
      {children}
    </VerificationLockCard>
  );
}
