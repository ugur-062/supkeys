import { PortalGuard } from "@/components/company-shell/portal-guard";

export default function SatinalmaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PortalGuard portal="satinalma">{children}</PortalGuard>;
}
