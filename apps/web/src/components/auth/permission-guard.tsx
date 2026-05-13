"use client";

import { usePermissions } from "@/hooks/use-permissions";
import { ShieldOff } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

interface Props {
  /** Tek permission veya birden fazla — mode'a göre AND/OR mantığı */
  permission: string | string[];
  mode?: "any" | "all";
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * V2-6.5 — Sayfa/section yetki sınırlayıcı. Kullanıcının `permissions` array'i
 * üzerinden kontrol yapar. Yetkisizse default "Erişim Yok" kartı gösterir.
 */
export function PermissionGuard({
  permission,
  mode = "any",
  fallback,
  children,
}: Props) {
  const { hasAny, hasAll } = usePermissions();
  const perms = Array.isArray(permission) ? permission : [permission];
  const allowed = mode === "all" ? hasAll(...perms) : hasAny(...perms);

  if (allowed) return <>{children}</>;
  if (fallback) return <>{fallback}</>;

  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
        <ShieldOff className="h-8 w-8 text-slate-400" />
      </div>
      <h1 className="mb-2 font-display text-xl font-bold text-brand-900">
        Erişim Yok
      </h1>
      <p className="mb-6 text-sm text-slate-600">
        Bu sayfayı görüntülemek için gerekli yetkiniz yok. Firma yöneticinizden
        yetki talep edin.
      </p>
      <Link
        href="/dashboard"
        className="inline-flex items-center rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
      >
        Dashboard'a Dön
      </Link>
    </div>
  );
}
