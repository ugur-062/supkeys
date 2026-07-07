"use client";

import { AuthShell } from "@/components/marketing/auth-shell";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { CompanyLoginForm } from "./login-form";

function safeNextPath(value: string | null): string {
  if (!value) return "/company";
  // Yol sınırında eşleşme: /companyfoo gibi lookalike'lar reddedilir.
  if (value !== "/company" && !value.startsWith("/company/")) return "/company";
  if (value.includes("//") || value.includes("\\") || value.includes("://")) {
    return "/company";
  }
  return value;
}

export function CompanyLoginClient() {
  const user = useCompanyAuthStore((s) => s.user);
  const isHydrated = useCompanyAuthStore((s) => s.isHydrated);
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = safeNextPath(searchParams.get("next"));

  useEffect(() => {
    if (isHydrated && user) {
      router.replace(nextPath);
    }
  }, [isHydrated, user, router, nextPath]);

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
