"use client";

import { useSupplierMe } from "@/hooks/use-supplier-auth";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { VerificationGateView } from "./verification-gate-view";

/**
 * Madde 29 — FAZ 3.0 doğrulama kapısı (tedarikçi). Şirket belgeleri VERIFIED +
 * 2FA aktif olmalı. Kapı YALNIZCA açık (PUBLIC) ihaleye davetsiz teklifte
 * zorunludur; `enforce=false` ise (alıcı davetiyle gelinen ihale) atlanır.
 */
export function SupplierVerificationGate({
  enforce,
  children,
}: {
  enforce: boolean;
  children: React.ReactNode;
}) {
  const me = useSupplierMe();
  const router = useRouter();

  if (!enforce) {
    return <>{children}</>;
  }

  if (me.isLoading || !me.data) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  const docsStatus = me.data.supplier.companyVerificationStatus;
  const docsVerified = docsStatus === "VERIFIED";
  const twoFa = me.data.supplierUser.twoFactorEnabled === true;

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
    <VerificationGateView
      title="Açık ihaleye teklif vermek için doğrulama gerekli"
      description={`Herkese açık ihalelere teklif verebilmek için hesabınızın doğrulama adımlarını tamamlamanız gerekir. ${missing} gereksinim eksik.`}
      requirements={[
        {
          done: docsVerified,
          title: "Şirket belgelerini doğrula",
          hint: docsVerified ? "Doğrulandı" : docsHint,
          href: "/supplier/kurumsal-kimlik",
        },
        {
          done: twoFa,
          title: "2 adımlı doğrulamayı etkinleştir",
          hint: twoFa ? "Aktif" : "E-posta tabanlı 2FA'yı açın",
          href: "/supplier/ayarlar/2fa-islemleri",
        },
      ]}
      onBack={() => router.push("/supplier/ihaleler")}
    />
  );
}
