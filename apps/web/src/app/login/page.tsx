import { SupkeysLogo } from "@/components/brand/logo";
import Link from "next/link";
import { LoginForm } from "./login-form";

export const metadata = {
  title: "Giriş Yap — Supkeys",
};

export default function LoginPage() {
  return (
    <main className="min-h-screen flex flex-col">
      <header className="px-8 py-6 border-b border-surface-border bg-white">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/">
            <SupkeysLogo />
          </Link>
          <Link href="/" className="text-sm text-slate-600 hover:text-brand-700">
            ← Ana Sayfa
          </Link>
        </div>
      </header>

      <section className="flex-1 px-4 py-12 md:py-16 flex items-start md:items-center">
        <div className="max-w-md mx-auto w-full">
          <div className="text-center mb-8 space-y-2">
            <h1 className="font-display font-bold text-3xl text-brand-900">
              Tekrar hoş geldin
            </h1>
            <p className="text-slate-600">
              Supkeys hesabına giriş yap.
            </p>
          </div>

          <LoginForm />

          <p className="text-center text-xs text-slate-500 mt-6">
            Henüz Supkeys kullanmıyor musun?{" "}
            <Link href="/demo-talep" className="text-brand-700 hover:underline">
              Demo talep et
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
