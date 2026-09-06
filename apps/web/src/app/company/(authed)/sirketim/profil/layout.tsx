import { PremiumOnly } from "@/components/company-shell/premium-only";

/**
 * Herkese açık firma profili PAKET (premium) özelliğidir — STANDART firmalar
 * profillerini yayınlayıp keşfedilebilir olamaz. PremiumOnly ile kapatılır
 * (doğrudan URL ile de girilemez). Eski `satis/profilim` kapısının aynısı;
 * adres Şirketim alanına taşındı (2026-09-05).
 */
export default function SirketimProfilLayout({ children }: { children: React.ReactNode }) {
  return <PremiumOnly minTier="SILVER">{children}</PremiumOnly>;
}
