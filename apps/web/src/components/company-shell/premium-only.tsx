"use client";

import { tierAtLeast } from "@rothern/shared";
import { PremiumGate } from "@/components/company-shell/premium-gate";
import { useCompanyAuth } from "@/hooks/use-company-auth";

/**
 * Segment kapısı — yalnız `minTier` ve üzeri kademeler içeriği görür; altına
 * yükseltme çağrısı (PremiumGate) gösterilir. Raporlar/Şablonlar (Gold) gibi
 * özellikleri rota segmenti seviyesinde (layout) kapatmak için kullanılır; alt
 * sayfalara doğrudan URL ile de girilemez. (Profil ve vitrin 2026-09-06'dan
 * beri her pakete açık — kapı yok.)
 *
 * Asıl güvenlik sınırı SUNUCUDA — bu yalnız UX katmanı. Firma bilgisi henüz
 * yüklenmediyse (undefined) içerik render edilir; kademe netleşince kapı
 * gösterilir (paketli kullanıcıda kapı yanıp sönmesin diye).
 */
export function PremiumOnly({
  children,
  minTier = "SILVER",
}: {
  children: React.ReactNode;
  minTier?: "SILVER" | "GOLD";
}) {
  const { company } = useCompanyAuth();
  if (company && !tierAtLeast(company.tier, minTier)) return <PremiumGate />;
  return <>{children}</>;
}
