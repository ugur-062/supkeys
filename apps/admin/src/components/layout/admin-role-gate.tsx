"use client";

import { useAdminAuth } from "@/hooks/use-admin-auth";
import {
  ADMIN_ACTION_ROLES,
  canAdminDo,
  type AdminAction,
} from "@/lib/admin-permissions";
import { ADMIN_ROLE_LABEL } from "@/lib/terms";
import { ShieldOff } from "lucide-react";

/** "Süper Admin ve Satış" — aksiyona izinli rollerin okunur listesi. */
function allowedRolesText(action: AdminAction): string {
  const labels = ADMIN_ACTION_ROLES[action].map(
    (r) => ADMIN_ROLE_LABEL[r] ?? r,
  );
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} ve ${labels[labels.length - 1]}`;
}

/** Yetkisiz rolün gördüğü kart (sorgu atılmaz, "Tekrar dene" yok). */
export function AdminNoAccess({ action }: { action: AdminAction }) {
  const roles = allowedRolesText(action);
  const only = ADMIN_ACTION_ROLES[action].length === 1;
  return (
    <div
      role="status"
      className="mx-auto max-w-md space-y-2 py-16 text-center"
    >
      <ShieldOff
        className="text-admin-text-muted mx-auto h-8 w-8"
        aria-hidden
      />
      <p className="text-admin-text text-sm font-medium">
        Bu sayfaya erişim yetkiniz yok.
      </p>
      <p className="text-admin-text-muted text-sm">
        {only
          ? `Bu sayfa yalnızca ${roles} rolüne açık.`
          : `Bu sayfa ${roles} rollerine açık.`}
      </p>
    </div>
  );
}

/**
 * Sayfa seviyesinde rol kapısı (arayüz testi T-09 — D-017, D-033, D-224).
 *
 * Menü öğesi gizli olsa da sayfa adresle (ya da rolü az önce düşürülmüş bir
 * personelin açık sekmesinden) açılabiliyordu: sorgular rol kontrolsüz
 * başlıyor, iki 403 toast'ı + işe yaramayan "Tekrar dene" çıkıyordu. İzinsiz
 * rolde `children` HİÇ mount edilmez (sorgu yok) ve yetki kartı çizilir.
 * Otorite backend `@RequireAdminRole`'dür; bu yalnız UX.
 */
export function AdminRoleGate({
  action,
  children,
}: {
  action: AdminAction;
  children: React.ReactNode;
}) {
  const { admin } = useAdminAuth();
  if (!canAdminDo(admin?.role, action)) {
    return <AdminNoAccess action={action} />;
  }
  return <>{children}</>;
}
