import { PremiumOnly } from "@/components/company-shell/premium-only";

export default function SatisRaporlarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PremiumOnly>{children}</PremiumOnly>;
}
