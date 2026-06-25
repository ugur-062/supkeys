import { RothernLogo } from "@/components/brand/logo";
import Link from "next/link";
import { SupplierForgotPasswordForm } from "./_components/forgot-password-form";

export const metadata = {
  title: "Şifremi Unuttum — Rothern Tedarikçi",
};

export default function SupplierForgotPasswordPage() {
  return (
    <main className="min-h-screen bg-surface-subtle flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <Link href="/">
            <RothernLogo variant="full" size="lg" priority />
          </Link>
        </div>

        <div className="bg-white ring-1 ring-zinc-950/5 rounded-2xl shadow-sm p-8">
          <div className="mb-6 text-center space-y-1">
            <h1 className="text-2xl font-semibold text-zinc-900">
              Şifremi Unuttum
            </h1>
            <p className="text-sm text-slate-500">
              E-posta adresinize sıfırlama bağlantısı gönderelim
            </p>
          </div>

          <SupplierForgotPasswordForm />
        </div>

        <div className="mt-6 text-center text-sm text-slate-600">
          <Link
            href="/supplier/login"
            className="text-zinc-600 hover:text-zinc-700 hover:underline"
          >
            ← Giriş sayfasına dön
          </Link>
        </div>
      </div>
    </main>
  );
}
