"use client";

import { RothernLogo } from "@/components/brand/logo";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { CompanyLoginForm } from "./login-form";

function safeNextPath(value: string | null): string {
  if (!value) return "/company";
  if (!value.startsWith("/company")) return "/company";
  if (value.startsWith("//")) return "/company";
  return value;
}

export function CompanyLoginClient() {
  const token = useCompanyAuthStore((s) => s.token);
  const isHydrated = useCompanyAuthStore((s) => s.isHydrated);
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = safeNextPath(searchParams.get("next"));

  useEffect(() => {
    if (isHydrated && token) {
      router.replace(nextPath);
    }
  }, [isHydrated, token, router, nextPath]);

  return (
    <main className="flex min-h-screen flex-col bg-zinc-50">
      {/* Üst koyu header — logo ortalı */}
      <header className="flex justify-center border-b border-zinc-800 bg-[#0A0A0A] py-5">
        <Link href="/">
          <RothernLogo variant="full" size="lg" priority />
        </Link>
      </header>

      {/* Gövde — temiz beyaz kart */}
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-zinc-950/5">
            <div className="mb-6 space-y-1 text-center">
              <h1 className="text-2xl font-semibold text-zinc-900">Giriş</h1>
              <p className="text-sm text-slate-500">
                Firma hesabınızla giriş yapın
              </p>
            </div>

            <CompanyLoginForm nextPath={nextPath} />
          </div>

          <div className="mt-6 text-center text-sm text-slate-600">
            Hesabınız yok mu?{" "}
            <Link
              href="/company/kayit"
              className="font-semibold text-zinc-900 hover:underline"
            >
              Firma olarak kayıt ol
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
