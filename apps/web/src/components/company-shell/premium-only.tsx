"use client";

import { PremiumGate } from "@/components/company-shell/premium-gate";
import { useCompanyAuth } from "@/hooks/use-company-auth";

/**
 * Segment kapısı — yalnız PAKET (premium) firmalar içeriği görür; STANDARD'a
 * yükseltme çağrısı (PremiumGate) gösterir. Raporlar/Şablonlar gibi premium
 * özelliklerini rota segmenti seviyesinde (layout'ta) kapatmak için kullanılır;
 * böylece alt sayfalara doğrudan URL ile de girilemez.
 *
 * Asıl güvenlik sınırı SUNUCUDA (CompanyPaidTierGuard) — bu yalnız UX katmanı.
 * Firma bilgisi henüz yüklenmediyse (undefined) içerik render edilir; STANDARD
 * netleşince kapı gösterilir (premium kullanıcıda kapı yanıp sönmesin diye).
 */
export function PremiumOnly({ children }: { children: React.ReactNode }) {
  const { company } = useCompanyAuth();
  if (company && company.tier !== "PAKET") return <PremiumGate />;
  return <>{children}</>;
}
