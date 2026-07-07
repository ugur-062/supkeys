import { PremiumOnly } from "@/components/company-shell/premium-only";

/**
 * Herkese açık firma profili PAKET (premium) özelliğidir — STANDARD firmalar
 * profillerini yayınlayıp keşfedilebilir olamaz. PremiumOnly ile kapatılır
 * (doğrudan URL ile de girilemez). raporlar/sablonlar/ilanlarim ile aynı desen.
 */
export default function SatisProfilimLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PremiumOnly>{children}</PremiumOnly>;
}
