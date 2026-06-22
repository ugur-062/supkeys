"use client";

import { useSupplierMe } from "@/hooks/use-supplier-auth";
import { useSupplierAuthStore } from "@/lib/supplier-auth/store";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { OnboardingWizard } from "./onboarding-wizard";

export function OnboardingClient() {
  const token = useSupplierAuthStore((s) => s.token);
  const isHydrated = useSupplierAuthStore((s) => s.isHydrated);
  const me = useSupplierMe(!!token);

  const completed = me.data?.supplier.onboardingCompletedAt != null;

  useEffect(() => {
    if (!isHydrated || typeof window === "undefined") return;
    if (!token) {
      window.location.href = "/supplier/login";
    } else if (completed) {
      // Zaten tamamlanmış → panele dön.
      window.location.href = "/supplier";
    }
  }, [isHydrated, token, completed]);

  if (!isHydrated || !token || me.isLoading || !me.data || completed) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-10">
      <div className="mx-auto mb-6 max-w-2xl">
        <h1 className="text-xl font-bold text-zinc-900">
          Firma Bilgilerinizi Tamamlayın
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Panele erişmeden önce firma bilgilerinizi tamamlayın. Kayıt sırasında
          verdiğiniz bilgileri tekrar istemiyoruz.
        </p>
      </div>
      <OnboardingWizard
        supplier={me.data.supplier}
        user={me.data.supplierUser}
        onDone={async () => {
          await me.refetch();
          window.location.href = "/supplier";
        }}
      />
    </div>
  );
}
