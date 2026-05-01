import { VerifyEmailClient } from "./verify-email-client";

export const metadata = {
  title: "E-posta Doğrulama — Supkeys",
};

interface VerifyEmailPageProps {
  searchParams: Promise<{ token?: string; type?: string }>;
}

export default async function VerifyEmailPage({
  searchParams,
}: VerifyEmailPageProps) {
  const { token, type } = await searchParams;

  return (
    <VerifyEmailClient
      token={token ?? ""}
      type={type === "supplier" ? "supplier" : type === "buyer" ? "buyer" : ""}
    />
  );
}
