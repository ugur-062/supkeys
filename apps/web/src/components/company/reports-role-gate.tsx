"use client";

import { Text } from "@/components/catalyst/text";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { userHasPermission } from "@/lib/company/permissions";
import { BarChart3 } from "lucide-react";

/**
 * Rapor sayfaları izin kapısı — backend `company-reports.controller`
 * `assertAllowed` ile BİREBİR: raporlar "Satınalma raporları"
 * (`buy:reports:view`) ister. Satın Almacı, Yönetici ve Kurucu hazır
 * setlerinde var; görüntüleyici setine de girer, koltuk tüketmez.
 */
export function ReportsRoleGate({
  portal,
  children,
}: {
  portal: "satinalma" | "satis";
  children: React.ReactNode;
}) {
  // `/me` izin listesi; eski önbellek yalnız rol taşıyorsa hazır sete düşer.
  const { user } = useCompanyAuth();
  const allowed = userHasPermission(user, "buy:reports:view");
  void portal; // satış raporu yok (2026-09-04) — imza çağıran için duruyor
  if (!allowed) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
        <BarChart3 className="h-8 w-8 text-zinc-300" aria-hidden />
        <h2 className="text-base font-semibold text-zinc-900">
          Raporlar yetki gerektirir
        </h2>
        <Text className="text-sm text-zinc-500">
          Satınalma raporlarını yalnız &ldquo;Satınalma raporları&rdquo; yetkisi
          taşıyan kullanıcılar görür. Yetki için firma yöneticinize başvurun.
        </Text>
      </div>
    );
  }
  return <>{children}</>;
}
