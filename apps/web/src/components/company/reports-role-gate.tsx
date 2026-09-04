"use client";

import { Text } from "@/components/catalyst/text";
import { useCompanyAuth, useHasCompanyPermission } from "@/hooks/use-company-auth";
import { BarChart3 } from "lucide-react";

/**
 * Rapor sayfaları rol kapısı — backend `assertTypeAllowed` ile BİREBİR:
 * raporlar `buy:bid:review` ister (satış raporları özellikle birlikte kaldırıldı).
 *
 * Denetim 2026-08-26 Parça 10 B3: 2026-07-27 ürün kararıyla backend'e
 * "GÖZETİM MUAFİYETİ" eklendi (Kurucu ve Yönetici işlem rolü taşımasa da
 * raporları görebilir — raporlar salt-okunur yönetim çıktısıdır), ama bu kapı
 * eski kuralda kaldı: işlem-rolsüz Kurucu API'den 200 alırken arayüzde duvara
 * çarpıyordu, yani özellik erişilemezdi.
 */
export function ReportsRoleGate({
  portal,
  children,
}: {
  portal: "satinalma" | "satis";
  children: React.ReactNode;
}) {
  const { user } = useCompanyAuth();
  const hasOpPermission = useHasCompanyPermission(
    portal === "satis" ? "sell:listing:manage" : "buy:bid:review",
  );
  // Gözetim muafiyeti — backend `assertTypeAllowed` ile aynı sıra.
  const isSupervisor =
    !!user?.isOwner ||
    !!user?.roles.some((r) => r === "SAHIP" || r === "YONETICI");
  const allowed = isSupervisor || hasOpPermission;
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
