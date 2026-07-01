"use client";

import { Button } from "@/components/catalyst/button";
import { useCompanyMe, useUpgradePremium } from "@/hooks/use-company-auth";
import { extractErrorMessage } from "@/lib/tenders/error";
import { Check, Lock } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

/**
 * İhale açma / Satınalma kapısı (Faz 3). Doğrulama tamamlanmadan Satınalma
 * paneli kilitli. 2 gereksinim: şirket belgeleri VERIFIED + 2FA aktif. İkisi de
 * tamamsa "Premium'a Geç" ile tier PAKET olur (ödeme sonraya bırakıldı).
 */
export function PremiumGate() {
  const me = useCompanyMe();
  const upgrade = useUpgradePremium();

  const docsVerified = me.data?.company.companyVerificationStatus === "VERIFIED";
  const twoFa = me.data?.user.twoFactorEnabled === true;
  const ready = docsVerified && twoFa;

  const docsHint =
    me.data?.company.companyVerificationStatus === "PENDING"
      ? "Belgeleriniz inceleniyor (1-2 iş günü)"
      : me.data?.company.companyVerificationStatus === "REJECTED"
        ? "Reddedildi — belgeleri güncelleyin"
        : "Zorunlu belgeleri yükleyip doğrulamaya gönderin";

  const doUpgrade = async () => {
    try {
      await upgrade.mutateAsync();
      toast.success("Premium'a geçildi — Satınalma paneli açıldı");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Premium'a geçilemedi"));
    }
  };

  return (
    <div className="mx-auto max-w-xl px-4 py-14">
      <div className="rounded-2xl border border-zinc-950/5 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50">
            <Lock className="h-5 w-5 text-blue-600" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-zinc-900">
              İhale oluşturmak için doğrulama gerekli
            </h1>
            <p className="text-sm text-zinc-500">
              Satınalma özellikleri (ihale açma) premium doğrulama gerektirir.
            </p>
          </div>
        </div>

        <ul className="mt-6 space-y-3">
          <Requirement
            done={!!docsVerified}
            title="Şirket belgelerini doğrula"
            hint={docsVerified ? "Doğrulandı" : docsHint}
            href="/company/ayarlar/dogrulama"
          />
          <Requirement
            done={!!twoFa}
            title="2 adımlı doğrulamayı (2FA) etkinleştir"
            hint={twoFa ? "Aktif" : "E-posta/uygulama tabanlı 2FA'yı açın"}
            href="/company/ayarlar/2fa"
          />
        </ul>

        <div className="mt-6 border-t border-zinc-100 pt-4">
          <Button
            className="w-full"
            disabled={!ready || upgrade.isPending}
            onClick={doUpgrade}
          >
            {upgrade.isPending ? "Geçiliyor…" : "Premium'a Geç"}
          </Button>
          {!ready ? (
            <p className="mt-2 text-center text-xs text-zinc-400">
              Yukarıdaki 2 adım tamamlanınca aktifleşir.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Requirement({
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
    <li className="flex items-center justify-between gap-3 rounded-xl border border-zinc-100 px-4 py-3">
      <div className="flex items-center gap-3">
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-full ${
            done ? "bg-emerald-500 text-white" : "bg-zinc-100 text-zinc-400"
          }`}
        >
          {done ? (
            <Check className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Lock className="h-3 w-3" aria-hidden="true" />
          )}
        </span>
        <div>
          <p className="text-sm font-medium text-zinc-900">{title}</p>
          <p className="text-xs text-zinc-500">{hint}</p>
        </div>
      </div>
      {!done ? (
        <Link
          href={href}
          className="shrink-0 rounded-lg border border-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-700 hover:border-zinc-300"
        >
          Aç
        </Link>
      ) : null}
    </li>
  );
}
