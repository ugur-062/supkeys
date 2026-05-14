"use client";

import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/use-permissions";
import {
  useTenantInvitations,
  useTenantUsers,
} from "@/hooks/use-tenant-users";
import { Shield, UserPlus2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { BackToSettings } from "./back-to-settings";
import { InviteUserModal } from "./invite-user-modal";
import { InvitationsList } from "./invitations-list";
import { UsersTable } from "./users-table";

export function KullaniciIslemleriView() {
  // V2-6.5 RBAC — settings:users permission'a göre erişim
  const { has } = usePermissions();
  const isAdmin = has("settings:users");

  const usersQuery = useTenantUsers();
  const invitationsQuery = useTenantInvitations();
  const [inviteOpen, setInviteOpen] = useState(false);

  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-8">
        <BackToSettings />
        <div className="mt-4 rounded-2xl border border-warning-200 bg-warning-50 p-6 flex gap-3 items-start">
          <Shield className="h-5 w-5 text-warning-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-warning-900">
              Sadece Firma Yöneticileri için
            </p>
            <p className="text-sm text-warning-800 mt-1">
              Kullanıcı yönetimi yalnızca <strong>Firma Yöneticisi</strong>{" "}
              rolündeki kullanıcılar tarafından yapılabilir.
            </p>
            <Link
              href="/dashboard/ayarlar"
              className="inline-block text-sm text-brand-600 hover:underline mt-3"
            >
              Ayarlara dön
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <BackToSettings />

      <div className="mt-4 mb-6 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold text-brand-900">
            Kullanıcı İşlemleri
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Ekibinize üye davet edin ve yetkileri yönetin.
          </p>
        </div>
        <Button variant="primary" onClick={() => setInviteOpen(true)}>
          <UserPlus2 className="h-4 w-4" />
          Üye Davet Et
        </Button>
      </div>

      <UsersTable users={usersQuery.data ?? []} loading={usersQuery.isLoading} />

      <div className="mt-6">
        <InvitationsList
          invitations={invitationsQuery.data ?? []}
          loading={invitationsQuery.isLoading}
        />
      </div>

      <InviteUserModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
      />
    </div>
  );
}
