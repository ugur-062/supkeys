import { PortalGuard } from "@/components/company-shell/portal-guard";

export default function SatisLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PortalGuard portal="satis">{children}</PortalGuard>;
}
