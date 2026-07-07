import { PremiumOnly } from "@/components/company-shell/premium-only";

/**
 * Satış İlanlarım PAKET (premium) özelliğidir — STANDARD firmalar ilan
 * oluşturamaz/yönetemez (yalnız teklif verir). Segment layout'unda PremiumOnly
 * ile kapatılır: alt sayfalara (yeni, [id]) doğrudan URL ile de girilemez.
 * (raporlar/sablonlar ile aynı desen.)
 */
export default function SatisIlanlarimLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PremiumOnly>{children}</PremiumOnly>;
}
