"use client";

import { useMe } from "@/hooks/use-auth";
import {
  ChevronRight,
  Loader2,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * Madde 29 — FAZ 3.0 doğrulama kapısı (alıcı). İhale oluşturmak için şirket
 * belgeleri VERIFIED + 2FA aktif olmalı. Değilse wizard yerine kapı gösterilir.
 */
export function VerificationGate({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const router = useRouter();

  if (me.isLoading || !me.data) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  const docsVerified = me.data.tenant.companyVerificationStatus === "VERIFIED";
  const docsStatus = me.data.tenant.companyVerificationStatus;
  const twoFa = me.data.twoFactorEnabled === true;

  if (docsVerified && twoFa) {
    return <>{children}</>;
  }

  const missing = [!docsVerified, !twoFa].filter(Boolean).length;

  const docsHint =
    docsStatus === "PENDING"
      ? "Belgeleriniz inceleniyor"
      : docsStatus === "REJECTED"
        ? "Reddedildi — belgeleri güncelleyin"
        : "Belgeleri yükleyin";

  return (
    <div className="mx-auto max-w-xl px-6 py-10">
      <div className="rounded-2xl border border-zinc-950/10 bg-white p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50">
          <ShieldAlert className="h-6 w-6 text-amber-600" />
        </div>
        <h1 className="text-lg font-bold text-zinc-900">
          İhale oluşturmak için doğrulama gerekli
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          İhale yayınlamadan önce hesabınızın doğrulama adımlarını
          tamamlamanız gerekir. {missing} gereksinim eksik.
        </p>

        <div className="mt-6 space-y-3 text-left">
          <RequirementRow
            done={docsVerified}
            title="Şirket belgelerini doğrula"
            hint={docsVerified ? "Doğrulandı" : docsHint}
            href="/dashboard/kurumsal-kimlik"
          />
          <RequirementRow
            done={twoFa}
            title="2 adımlı doğrulamayı etkinleştir"
            hint={twoFa ? "Aktif" : "E-posta tabanlı 2FA'yı açın"}
            href="/dashboard/ayarlar/2fa-islemleri"
          />
        </div>

        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="mt-6 text-sm font-medium text-zinc-500 hover:text-zinc-800"
        >
          Panele dön
        </button>
      </div>
    </div>
  );
}

function RequirementRow({
  done,
  title,
  hint,
  href,
}: {
  done: boolean;
  title: string;
  hint: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl border border-zinc-950/10 p-4 transition-colors hover:bg-zinc-50"
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
          done
            ? "bg-success-100 text-success-700"
            : "bg-zinc-100 text-zinc-400"
        }`}
      >
        <ShieldCheck className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-zinc-900">{title}</p>
        <p className="text-xs text-zinc-500">{hint}</p>
      </div>
      {!done ? (
        <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-zinc-600">
          Aç <ChevronRight className="h-4 w-4" />
        </span>
      ) : null}
    </Link>
  );
}
