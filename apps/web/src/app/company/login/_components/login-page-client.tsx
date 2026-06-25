"use client";

import { AuthShell } from "@/components/marketing/auth-shell";
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
    <AuthShell
      title="Giriş"
      subtitle="Firma hesabınızla giriş yapın"
      footer={
        <>
          Hesabınız yok mu?{" "}
          <Link
            href="/company/kayit"
            className="font-semibold text-zinc-900 hover:underline"
          >
            Firma olarak kayıt ol
          </Link>
        </>
      }
    >
      <CompanyLoginForm nextPath={nextPath} />
    </AuthShell>
  );
}
