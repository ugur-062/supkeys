import { AuthShell } from "@/components/marketing/auth-shell";
import Link from "next/link";
import { Suspense } from "react";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata = {
  title: "Parola Sıfırla — Rothern",
};

/** Parola sıfırlama — diğer auth ekranlarıyla aynı kabuk (AuthShell). */
export default function ResetPasswordPage() {
  return (
    <AuthShell
      title="Parolanı sıfırla"
      subtitle="E-postana gönderilen bağlantıyla yeni parolanı oluştur."
      footer={
        <>
          Hatırladın mı?{" "}
          <Link
            href="/company/login"
            className="font-semibold text-zinc-900 hover:underline"
          >
            Giriş yap
          </Link>
        </>
      }
    >
      <Suspense
        fallback={
          <div className="h-64 animate-pulse rounded-2xl bg-zinc-100" aria-hidden />
        }
      >
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  );
}
