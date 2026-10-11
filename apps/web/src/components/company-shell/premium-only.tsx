"use client";

import { tierAtLeast } from "@rothern/shared";
import { VerificationGate } from "@/components/company/verification-gate";
import { useCompanyAuth } from "@/hooks/use-company-auth";

/**
 * Segment kapısı — yalnız `minTier` ve üzeri EFEKTİF kademeler içeriği görür;
 * altına doğrulama kapısı (`VerificationGate`) gösterilir. Raporlar/Şablonlar
 * gibi özellikleri rota segmenti seviyesinde (layout) kapatmak için
 * kullanılır; alt sayfalara doğrudan URL ile de girilemez.
 *
 * ÜCRETSİZ DÖNEM (2026-10-07): `/me` `company.tier` efektif değerdir —
 * doğrulanmış firma tam erişimlidir (API `effective-tier.ts`). Kapı mantığı
 * aynı kaldı; kapı ekranı paket satmaz, doğrulamaya yönlendirir.
 *
 * Asıl güvenlik sınırı SUNUCUDA — bu yalnız UX katmanı. Firma bilgisi henüz
 * yüklenmediyse (undefined) içerik render edilir; kademe netleşince kapı
 * gösterilir (erişimi olan kullanıcıda kapı yanıp sönmesin diye).
 */
export function VerifiedOnly({
  children,
  minTier = "SILVER",
}: {
  children: React.ReactNode;
  /** İç eşik (efektif kademe); kullanıcıya gösterilmez. */
  minTier?: "SILVER" | "GOLD";
}) {
  const { company } = useCompanyAuth();
  if (company && !tierAtLeast(company.tier, minTier)) return <VerificationGate />;
  return <>{children}</>;
}

/** @deprecated Ad geriye dönük; yeni kod `VerifiedOnly` kullanır. */
export const PremiumOnly = VerifiedOnly;
