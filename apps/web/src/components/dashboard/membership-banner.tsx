"use client";

import { useAuthStore } from "@/lib/auth/store";
import { cn } from "@/lib/utils";
import { AlertTriangle, Clock } from "lucide-react";

/**
 * V2-6.5 — Üyelik süresi bitmek üzereyse veya bittiyse dashboard üstünde
 * banner. Süresi dolan kullanıcı zaten login olamaz; bu banner sadece
 * yaklaşan/dolan durumlarda görünür (active oturum içindeyken bitiş anına
 * gelirse de uyarsın).
 */
export function MembershipBanner() {
  const endAt = useAuthStore((s) => s.user?.tenant.membershipEndAt);
  if (!endAt) return null;

  const endsAt = new Date(endAt);
  const now = Date.now();
  const expired = endsAt.getTime() < now;
  const daysLeft = Math.ceil(
    (endsAt.getTime() - now) / (24 * 3600 * 1000),
  );
  if (!expired && daysLeft > 14) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-4 py-2 text-sm md:px-8",
        expired
          ? "bg-danger-50 text-danger-800 border-b border-danger-200"
          : "bg-warning-50 text-warning-800 border-b border-warning-200",
      )}
    >
      {expired ? (
        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
      ) : (
        <Clock className="h-4 w-4 flex-shrink-0" />
      )}
      <p className="font-semibold">
        {expired
          ? "Üyelik süreniz sona erdi. Sistemi kullanmaya devam edebilmek için Rothern ekibiyle iletişime geçin."
          : `Üyelik süreniz ${daysLeft} gün içinde sona eriyor. Yenileme için Rothern ekibiyle iletişime geçin.`}
      </p>
    </div>
  );
}
