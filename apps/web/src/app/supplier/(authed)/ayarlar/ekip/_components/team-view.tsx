"use client";

import { Button } from "@/components/ui/button";
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
import {
  Loader2,
  Mail,
  RotateCw,
  Trash2,
  UserPlus2,
  Users2,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { InviteMemberModal } from "./invite-member-modal";

export function TeamView() {
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
          <div className="flex items-start justify-between gap-4 mb-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand-50">
                <Users2 className="h-5 w-5 text-brand-600" />
              </div>
              <div>
                <h2 className="font-display font-bold text-lg text-brand-900">
                  Ekip Üyeleri
                </h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  Tüm üyeler eşit yetkiye sahiptir.
                </p>
              </div>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setInviteOpen(true)}
            >
              <UserPlus2 className="h-4 w-4" />
              Davet Et
            </Button>
          </div>

          {members.isLoading ? (
            <div className="flex items-center justify-center py-8 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Yükleniyor…
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">
                      Ad Soyad
                    </th>
                    <th className="px-3 py-2 text-left font-semibold">
                      E-posta
                    </th>
                    <th className="px-3 py-2 text-left font-semibold">
                      Telefon
                    </th>
                    <th className="px-3 py-2 text-left font-semibold">
                      Son Giriş
                    </th>
                    <th className="px-3 py-2 text-center font-semibold">
                      Durum
                    </th>
                    <th className="px-3 py-2 text-right font-semibold w-12" />
                  </tr>
                </thead>
                <tbody>
                  {memberList.map((m) => (
                    <tr
                      key={m.id}
                      className="border-t border-surface-border hover:bg-slate-50/40"
                    >
                      <td className="px-3 py-3 font-semibold text-brand-900">
                        {m.firstName} {m.lastName}
                        {m.isYou ? (
                          <span className="text-slate-400"> (Siz)</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 text-slate-600">{m.email}</td>
                      <td className="px-3 py-3 text-slate-600">
                        {m.phone || "—"}
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        {m.lastLoginAt
                          ? format(new Date(m.lastLoginAt), "dd.MM.yyyy HH:mm", {
                              locale: tr,
                            })
                          : "—"}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {m.isActive ? (
                          <span className="inline-flex items-center rounded-full bg-success-50 px-2 py-0.5 text-xs font-semibold text-success-700">
                            Aktif
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                            Pasif
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {!m.isYou && m.isActive ? (
                          <button
                            type="button"
                            onClick={() =>
                              handleRemove(m.id, `${m.firstName} ${m.lastName}`)
                            }
                            className="text-slate-400 hover:text-danger-600 transition-colors p-1"
                            title="Ekipten çıkar"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Bekleyen davetler */}
        <section className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-warning-50">
              <Mail className="h-5 w-5 text-warning-600" />
            </div>
            <div>
              <h2 className="font-display font-bold text-lg text-brand-900">
                Bekleyen Davetler
              </h2>
              <p className="text-sm text-slate-500 mt-0.5">
                Henüz kabul edilmemiş davetler.
              </p>
            </div>
          </div>

          {invitations.isLoading ? (
            <div className="flex items-center justify-center py-6 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Yükleniyor…
            </div>
          ) : inviteList.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">
              Bekleyen davet yok.
            </p>
          ) : (
            <div className="space-y-2">
              {inviteList.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-surface-border px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-brand-900 truncate">
                      {inv.email}
                    </p>
                    <p className="text-xs text-slate-500">
                      {inv.invitedBy.firstName} {inv.invitedBy.lastName}{" "}
                      tarafından · Son geçerlilik{" "}
                      {format(new Date(inv.expiresAt), "dd.MM.yyyy", {
                        locale: tr,
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleResend(inv.id)}
                      disabled={resendMutation.isPending}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:border-brand-300 hover:text-brand-700 disabled:opacity-50"
                      title="Yeniden gönder"
                    >
                      <RotateCw className="h-3.5 w-3.5" />
                      Yeniden Gönder
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRevoke(inv.id, inv.email)}
                      className="text-slate-400 hover:text-danger-600 transition-colors p-1.5"
                      title="Daveti iptal et"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <InviteMemberModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </>
  );
}
