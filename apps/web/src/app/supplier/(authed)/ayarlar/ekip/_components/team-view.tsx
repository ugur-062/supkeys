"use client";

import { Badge } from "@/components/catalyst/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/catalyst/table";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { useSupplierAuth } from "@/hooks/use-supplier-auth";
import {
  useRemoveTeamMember,
  useResendTeamInvitation,
  useRevokeTeamInvitation,
  useTeamInvitations,
  useTeamMembers,
} from "@/hooks/use-supplier-team";
import { extractErrorMessage } from "@/lib/tenders/error";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { Loader2, Mail, RotateCw, Trash2, UserPlus2, Users2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { InviteMemberModal } from "./invite-member-modal";

export function TeamView() {
  const { supplierUser } = useSupplierAuth();
  const isManager = supplierUser?.isManager === true;
  const members = useTeamMembers();
  const invitations = useTeamInvitations();
  const removeMutation = useRemoveTeamMember();
  const resendMutation = useResendTeamInvitation();
  const revokeMutation = useRevokeTeamInvitation();
  const [inviteOpen, setInviteOpen] = useState(false);

  const handleRemove = async (id: string, name: string) => {
    if (
      !confirm(
        `"${name}" ekipten çıkarılacak ve giriş yapamayacak. Devam edilsin mi?`,
      )
    )
      return;
    try {
      await removeMutation.mutateAsync(id);
      toast.success("Üye ekipten çıkarıldı");
    } catch (err) {
      toast.error(extractErrorMessage(err, "İşlem başarısız"));
    }
  };

  const handleResend = async (id: string) => {
    try {
      await resendMutation.mutateAsync(id);
      toast.success("Davet yeniden gönderildi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Gönderilemedi"));
    }
  };

  const handleRevoke = async (id: string, email: string) => {
    if (!confirm(`"${email}" davetini iptal etmek istiyor musunuz?`)) return;
    try {
      await revokeMutation.mutateAsync(id);
      toast.success("Davet iptal edildi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "İptal başarısız"));
    }
  };

  const memberList = members.data ?? [];
  const inviteList = invitations.data ?? [];

  return (
    <>
      <div className="space-y-6">
        {/* Üyeler */}
        <section className="card p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-zinc-100">
                <Users2 className="h-5 w-5 text-zinc-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-zinc-950">Ekip Üyeleri</h2>
                <p className="mt-0.5 text-sm text-zinc-500">
                  Kullanıcı yönetimi yalnızca firma yöneticisindedir.
                </p>
              </div>
            </div>
            {isManager ? (
              <Button onClick={() => setInviteOpen(true)}>
                <UserPlus2 className="h-4 w-4" />
                Davet Et
              </Button>
            ) : null}
          </div>

          {members.isLoading ? (
            <div className="flex items-center justify-center py-8 text-zinc-500">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Yükleniyor…
            </div>
          ) : (
            <Table dense>
              <TableHead>
                <TableRow>
                  <TableHeader>Ad Soyad</TableHeader>
                  <TableHeader className="hidden sm:table-cell">
                    E-posta
                  </TableHeader>
                  <TableHeader className="hidden md:table-cell">
                    Telefon
                  </TableHeader>
                  <TableHeader className="hidden lg:table-cell">
                    Son Giriş
                  </TableHeader>
                  <TableHeader>Durum</TableHeader>
                  <TableHeader className="text-right">İşlem</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {memberList.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium text-zinc-900">
                      {m.firstName} {m.lastName}
                      {m.isYou ? (
                        <span className="text-zinc-400"> (Siz)</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="hidden text-zinc-500 sm:table-cell">
                      {m.email}
                    </TableCell>
                    <TableCell className="hidden text-zinc-500 md:table-cell">
                      {m.phone || "—"}
                    </TableCell>
                    <TableCell className="hidden text-zinc-500 lg:table-cell">
                      {m.lastLoginAt
                        ? format(new Date(m.lastLoginAt), "dd.MM.yyyy HH:mm", {
                            locale: tr,
                          })
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {m.isActive ? (
                        <Badge color="lime">Aktif</Badge>
                      ) : (
                        <Badge color="zinc">Pasif</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {isManager && !m.isYou && m.isActive ? (
                        <IconButton
                          tone="danger"
                          onClick={() =>
                            handleRemove(m.id, `${m.firstName} ${m.lastName}`)
                          }
                          title="Ekipten çıkar"
                          aria-label="Ekipten çıkar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </IconButton>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>

        {/* Bekleyen davetler */}
        <section className="card p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-warning-50">
              <Mail className="h-5 w-5 text-warning-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-950">
                Bekleyen Davetler
              </h2>
              <p className="mt-0.5 text-sm text-zinc-500">
                Henüz kabul edilmemiş davetler.
              </p>
            </div>
          </div>

          {invitations.isLoading ? (
            <div className="flex items-center justify-center py-6 text-zinc-500">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Yükleniyor…
            </div>
          ) : inviteList.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-500">
              Bekleyen davet yok.
            </p>
          ) : (
            <Table dense>
              <TableHead>
                <TableRow>
                  <TableHeader>E-posta</TableHeader>
                  <TableHeader className="hidden sm:table-cell">
                    Davet Eden
                  </TableHeader>
                  <TableHeader className="hidden sm:table-cell">
                    Son Geçerlilik
                  </TableHeader>
                  <TableHeader className="text-right">İşlem</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {inviteList.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium text-zinc-900">
                      {inv.email}
                    </TableCell>
                    <TableCell className="hidden text-zinc-500 sm:table-cell">
                      {inv.invitedBy.firstName} {inv.invitedBy.lastName}
                    </TableCell>
                    <TableCell className="hidden text-zinc-500 sm:table-cell">
                      {format(new Date(inv.expiresAt), "dd.MM.yyyy", {
                        locale: tr,
                      })}
                    </TableCell>
                    <TableCell className="text-right">
                      {isManager ? (
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleResend(inv.id)}
                            disabled={resendMutation.isPending}
                          >
                            <RotateCw className="h-3.5 w-3.5" />
                            Yeniden Gönder
                          </Button>
                          <IconButton
                            tone="danger"
                            onClick={() => handleRevoke(inv.id, inv.email)}
                            title="Daveti iptal et"
                            aria-label="Daveti iptal et"
                          >
                            <X className="h-4 w-4" />
                          </IconButton>
                        </div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
      </div>

      <InviteMemberModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </>
  );
}
