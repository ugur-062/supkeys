import { VerifiedOnly } from "@/components/company-shell/premium-only";

/** Şablonlar satınalma paneli özelliği: efektif en üst kademe = doğrulanmış firma (menüdeki kilit ile aynı; API PaidTierGuard). */
export default function SablonlarLayout({ children }: { children: React.ReactNode }) {
  return <VerifiedOnly minTier="GOLD">{children}</VerifiedOnly>;
}
