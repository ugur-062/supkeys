import { AcceptView } from "./_components/accept-view";

export const metadata = {
  title: "Ekip Davetini Kabul Et — Supkeys",
  robots: { index: false, follow: false },
};

export default async function SupplierAcceptInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <AcceptView token={token} />;
}
