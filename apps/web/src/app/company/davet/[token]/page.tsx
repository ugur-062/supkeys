import type { Metadata } from "next";
import { AcceptInviteClient } from "./_components/accept-invite-client";

export const metadata: Metadata = { title: "Ekip Daveti — Rothern" };

export default async function DavetPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <AcceptInviteClient token={token} />;
}
