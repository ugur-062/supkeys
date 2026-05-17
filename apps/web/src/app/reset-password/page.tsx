import { SupkeysLogo } from "@/components/brand/logo";
import Link from "next/link";
import { Suspense } from "react";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata = {
  title: "Parola Sıfırla — Supkeys",
};

export default function ResetPasswordPage() {
  return (
    <main className="min-h-screen flex flex-col">
      <header className="px-8 py-6 border-b border-surface-border bg-white">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/">
            <SupkeysLogo variant="full" size="md" priority />
          </Link>
          <Link
            href="/login"
            className="text-sm text-slate-600 hover:text-brand-700"
          >
            ← Girişe dön
          </Link>
        </div>
      </header>

      <section className="flex-1 px-4 py-12 md:py-16 flex items-start md:items-center">
        <div className="max-w-md mx-auto w-full">
          <div className="text-center mb-8 space-y-2">
            <h1 className="font-display font-bold text-3xl text-brand-900">
              Parolanı sıfırla
            </h1>
            <p className="text-slate-600">
              Destek ekibimizin gönderdiği bağlantıyla yeni parolanı oluştur.
            </p>
          </div>

          <Suspense
            fallback={
              <div className="h-64 rounded-2xl bg-slate-100 animate-pulse" />
            }
          >
            <ResetPasswordForm />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
