import { PremiumOnly } from "@/components/company-shell/premium-only";

/** Şablonlar Gold paket özelliği (satınalma paneli) (menüdeki kilit ile aynı; API PaidTierGuard). */
export default function SablonlarLayout({ children }: { children: React.ReactNode }) {
  return <PremiumOnly minTier="GOLD">{children}</PremiumOnly>;
}
