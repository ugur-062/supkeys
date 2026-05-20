import { SupkeysLogo } from "@/components/brand/logo";
import Link from "next/link";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata = {
  title: "Şifremi Unuttum — Supkeys",
};

export default function ForgotPasswordPage() {
  return (
    <main className="min-h-screen flex flex-col">
      <header className="px-8 py-6 border-b border-surface-border bg-white">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/">
            <SupkeysLogo variant="full" size="md" priority />
          </Link>
          <Link href="/login" className="text-sm text-slate-600 hover:text-brand-700">
            ← Giriş
          </Link>
        </div>
      </header>

      <section className="flex-1 px-4 py-12 md:py-16 flex items-start md:items-center">
        <div className="max-w-md mx-auto w-full">
          <div className="text-center mb-8 space-y-2">
            <h1 className="font-display font-bold text-3xl text-brand-900">
              Şifremi Unuttum
            </h1>
            <p className="text-slate-600">
              E-posta adresinizi girin, şifre sıfırlama bağlantısı gönderelim.
            </p>
          </div>

          <ForgotPasswordForm />

          <p className="text-center text-xs text-slate-500 mt-6">
            <Link href="/login" className="text-brand-700 hover:underline">
              Giriş sayfasına dön
            </Link>
          </p>
        </div>
      </section>

      <footer className="px-8 py-6 border-t border-surface-border bg-white">
        <div className="max-w-7xl mx-auto text-sm text-slate-500 text-center">
          © 2026 Supkeys
        </div>
      </footer>
    </main>
  );
}
