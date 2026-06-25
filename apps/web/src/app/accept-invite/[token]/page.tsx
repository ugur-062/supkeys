import { AcceptInviteView } from "./_components/accept-invite-view";

export const metadata = {
  title: "Daveti Kabul Et — Rothern",
  robots: { index: false, follow: false },
};

export default async function AcceptInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <AcceptInviteView token={token} />;
}
