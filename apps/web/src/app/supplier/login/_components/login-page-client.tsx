"use client";

import { SupkeysLogo } from "@/components/brand/logo";
import { useSupplierAuthStore } from "@/lib/supplier-auth/store";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { SupplierLoginForm } from "./login-form";

function safeNextPath(value: string | null): string {
  if (!value) return "/supplier/dashboard";
  if (!value.startsWith("/supplier/") && value !== "/supplier") {
    return "/supplier/dashboard";
  }
  if (value.startsWith("//")) return "/supplier/dashboard";
  return value;
}

export function SupplierLoginClient() {
  const token = useSupplierAuthStore((s) => s.token);
  const isHydrated = useSupplierAuthStore((s) => s.isHydrated);
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = safeNextPath(searchParams.get("next"));

  useEffect(() => {
    if (isHydrated && token) {
      router.replace(nextPath);
    }
  }, [isHydrated, token, router, nextPath]);

  return (
    <main className="min-h-screen bg-surface-subtle flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <Link href="/">
            <SupkeysLogo variant="full" size="lg" priority />
          </Link>
        </div>

        <div className="bg-white border border-surface-border rounded-2xl shadow-sm p-8">
          <div className="mb-6 text-center space-y-1">
            <h1 className="text-2xl font-display font-bold text-brand-900">
              Tedarikçi Girişi
            </h1>
            <p className="text-sm text-slate-500">
              Hesabınıza giriş yaparak ihalelere ulaşın
            </p>
          </div>

          <SupplierLoginForm />
        </div>

        <div className="mt-6 text-center text-sm text-slate-600">
          Hesabınız yok mu?{" "}
          <Link
            href="/register/supplier"
            className="text-brand-600 hover:text-brand-700 font-semibold hover:underline"
          >
            Tedarikçi olarak kayıt ol
          </Link>
        </div>

        <div className="mt-3 text-center text-xs text-slate-400">
          Alıcı musunuz?{" "}
          <Link
            href="/login"
            className="text-brand-600 hover:text-brand-700 hover:underline"
          >
            Buradan giriş yapın →
          </Link>
        </div>
      </div>
    </main>
  );
}
