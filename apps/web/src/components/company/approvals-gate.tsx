"use client";

import { Text } from "@/components/catalyst/text";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { userHasPermission } from "@/lib/company/permissions";
import { ClipboardCheck } from "lucide-react";

/**
 * Onaylar sayfası izin kapısı (yetki tablosu Faz 2) — API `approvals/*` ile
 * aynı: "Onaylama" (approval:act) ya da "Onay akışı tanımlama"
 * (approvals:manage). Eskiden sayfa herkese açıktı; yalnız menü bağlantısı
 * gizleniyordu.
 */
export function ApprovalsGate({ children }: { children: React.ReactNode }) {
  const { user } = useCompanyAuth();
  const allowed = userHasPermission(user, ["approval:act", "approvals:manage"]);
  if (!allowed) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
        <ClipboardCheck className="h-8 w-8 text-zinc-300" aria-hidden />
        <h2 className="text-base font-semibold text-zinc-900">
          Onaylar yetki gerektirir
        </h2>
        <Text className="text-sm text-zinc-500">
          Bu sayfayı yalnız &ldquo;Onaylama&rdquo; ya da &ldquo;Onay akışı
          tanımlama&rdquo; yetkisi taşıyan kullanıcılar görür. Yetki için firma
          yöneticinize başvurun.
        </Text>
      </div>
    );
  }
  return <>{children}</>;
}
