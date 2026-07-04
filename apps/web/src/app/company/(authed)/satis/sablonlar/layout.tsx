import { PremiumOnly } from "@/components/company-shell/premium-only";

export default function SatisSablonlarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PremiumOnly>{children}</PremiumOnly>;
}
