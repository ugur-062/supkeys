"use client";

import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import { Subheading } from "@/components/catalyst/heading";
import { Text } from "@/components/catalyst/text";
import {
  useCompanyUsers,
  useRemoveUser,
  useUpdateUserRoles,
  type CompanyTeamUser,
} from "@/hooks/use-company-users";
import type { CompanyRole } from "@/lib/company-auth/types";
import { extractErrorMessage } from "@/lib/tenders/error";
import { TrashIcon } from "@heroicons/react/20/solid";
import { useState } from "react";
import { toast } from "sonner";
import { InviteUserDialog } from "./invite-user-dialog";

const ROLES: { key: CompanyRole; label: string }[] = [
  { key: "YONETICI", label: "Yönetici" },
  { key: "SATIN_ALMACI", label: "Satın Almacı" },
  { key: "SATISCI", label: "Satışçı" },
  { key: "ONAYLAYICI", label: "Onaylayıcı" },
];

export function CompanyUsersSection({
  canManage,
  meId,
}: {
  canManage: boolean;
  meId: string | undefined;
}) {
  const { data: users, isLoading } = useCompanyUsers();
  const updateRoles = useUpdateUserRoles();
  const removeUser = useRemoveUser();
  const [inviteOpen, setInviteOpen] = useState(false);

  const toggleRole = async (u: CompanyTeamUser, role: CompanyRole) => {
    const has = u.roles.includes(role);
    const roles = has ? u.roles.filter((r) => r !== role) : [...u.roles, role];
    if (roles.length === 0) {
      toast.error("En az bir rol kalmalı");
      return;
    }
    try {
      await updateRoles.mutateAsync({ id: u.id, roles });
    } catch (err) {
      toast.error(extractErrorMessage(err, "Rol güncellenemedi"));
    }
  };

  const handleRemove = async (u: CompanyTeamUser) => {
    if (!confirm(`${u.firstName} ${u.lastName} ekipten çıkarılsın mı?`)) return;
    try {
      await removeUser.mutateAsync(u.id);
      toast.success("Kullanıcı çıkarıldı");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Çıkarılamadı"));
    }
  };

  return (
    <section className="rounded-xl border border-zinc-950/10 bg-white p-5">
      <div className="flex items-center justify-between">
        <Subheading>Kullanıcılar & Roller</Subheading>
        {canManage ? (
          <Button onClick={() => setInviteOpen(true)}>Kullanıcı Ekle</Button>
        ) : null}
      </div>

      {isLoading ? (
        <Text className="mt-3 text-sm text-zinc-500">Yükleniyor…</Text>
      ) : (
        <div className="mt-4 space-y-3">
          {(users ?? []).map((u) => (
            <div
              key={u.id}
              className="rounded-lg border border-zinc-200 px-4 py-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-zinc-900">
                    {u.firstName} {u.lastName}
                    {u.isOwner ? (
                      <span className="ml-2 text-xs text-amber-600">
                        · Firma Sahibi
                      </span>
                    ) : null}
                  </div>
                  <div className="truncate text-xs text-zinc-500">
                    {u.email}
                  </div>
                </div>
                {canManage && !u.isOwner && u.id !== meId ? (
                  <Button plain onClick={() => handleRemove(u)}>
                    <TrashIcon data-slot="icon" />
                  </Button>
                ) : null}
              </div>

              {/* Roller */}
              <div className="mt-2 flex flex-wrap gap-2">
                {ROLES.map((r) => {
                  const on = u.roles.includes(r.key);
                  const locked =
                    !canManage || (u.isOwner && r.key === "YONETICI");
                  if (!canManage) {
                    return on ? (
                      <Badge key={r.key} color="blue">
                        {r.label}
                      </Badge>
                    ) : null;
                  }
                  return (
                    <button
                      key={r.key}
                      type="button"
                      disabled={locked || updateRoles.isPending}
                      onClick={() => toggleRole(u, r.key)}
                      className={`rounded-md border px-2 py-0.5 text-xs transition ${
                        on
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-zinc-200 text-zinc-400 hover:border-zinc-300"
                      } ${locked ? "cursor-not-allowed opacity-60" : ""}`}
                    >
                      {r.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <InviteUserDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </section>
  );
}
