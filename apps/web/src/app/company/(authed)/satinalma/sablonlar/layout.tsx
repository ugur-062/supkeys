import { PremiumOnly } from "@/components/company-shell/premium-only";

/** Şablonlar Silver+ paket özelliği (menüdeki kilit ile aynı; API PaidTierGuard). */
export default function SablonlarLayout({ children }: { children: React.ReactNode }) {
  return <PremiumOnly minTier="SILVER">{children}</PremiumOnly>;
}
