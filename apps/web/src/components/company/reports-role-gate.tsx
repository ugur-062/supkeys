"use client";

import { Text } from "@/components/catalyst/text";
import { useHasCompanyPermission } from "@/hooks/use-company-auth";
import { BarChart3 } from "lucide-react";

/**
 * Rapor sayfaları rol kapısı — backend assertTypeAllowed ile BİREBİR (F7):
 * ALIM raporları buy:bid:review (Satın Almacı), SATIS raporları
 * sell:listing:manage (Satışçı) ister. Etiket-only (Kurucu/Yönetici) rapor
 * ÜRETEMEZ (backend 403) — form yerine açıklayıcı not gösterilir.
 */
export function ReportsRoleGate({
  portal,
  children,
}: {
  portal: "satinalma" | "satis";
  children: React.ReactNode;
}) {
  const allowed = useHasCompanyPermission(
    portal === "satis" ? "sell:listing:manage" : "buy:bid:review",
  );
  if (!allowed) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
        <BarChart3 className="h-8 w-8 text-zinc-300" aria-hidden />
        <h2 className="text-base font-semibold text-zinc-900">
          Raporlar işlem rolü gerektirir
        </h2>
        <Text className="text-sm text-zinc-500">
          {portal === "satis"
            ? "Satış raporlarını yalnız Satışçı rolü taşıyan kullanıcılar üretebilir."
            : "Satınalma raporlarını yalnız Satın Almacı rolü taşıyan kullanıcılar üretebilir."}{" "}
          Rol ataması için firma yöneticinize başvurun.
        </Text>
      </div>
    );
  }
  return <>{children}</>;
}
