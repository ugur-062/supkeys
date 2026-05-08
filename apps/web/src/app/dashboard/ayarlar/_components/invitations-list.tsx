"use client";

import { Button } from "@/components/ui/button";
import {
  useCancelInvitation,
  useResendInvitation,
} from "@/hooks/use-tenant-users";
import { extractErrorMessage } from "@/lib/tenders/error";
import { roleLabel } from "@/lib/users/labels";
import type { TenantInvitation } from "@/lib/users/types";
import { formatDistanceToNowStrict } from "date-fns";
import { tr } from "date-fns/locale";
import { Loader2, Mail, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";

interface Props {
  invitations: TenantInvitation[];
  loading: boolean;
}

export function InvitationsList({ invitations, loading }: Props) {
  const cancelMutation = useCancelInvitation();
  const resendMutation = useResendInvitation();

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 flex items-center justify-center text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Davetler yükleniyor…
      </div>
    );
  }

  if (invitations.length === 0) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <header className="px-6 py-4 border-b border-slate-200 flex items-center gap-2">
        <Mail className="h-4 w-4 text-warning-600" />
        <h3 className="text-xs font-bold text-brand-900 uppercase tracking-wide">
          Bekleyen Davetler ({invitations.length})
        </h3>
      </header>
      <ul className="divide-y divide-slate-100">
        {invitations.map((inv) => {
          const expiresIn = formatDistanceToNowStrict(new Date(inv.expiresAt), {
            addSuffix: true,
            locale: tr,
          });
          return (
            <li
              key={inv.id}
              className="px-6 py-4 flex items-center gap-4 flex-wrap"
            >
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-brand-900 truncate">
                  {inv.email}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {roleLabel(inv.role)} ·{" "}
                  {inv.invitedBy.firstName} {inv.invitedBy.lastName} davet etti
                  · Süre: {expiresIn}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    resendMutation.mutate(inv.id, {
                      onSuccess: () => {
                        toast.success("Davet tekrar gönderildi");
                      },
                      onError: (err) => {
                        toast.error(
                          extractErrorMessage(err, "Yeniden gönderme başarısız"),
                        );
                      },
                    });
                  }}
                  loading={
                    resendMutation.isPending &&
                    resendMutation.variables === inv.id
                  }
                >
                  <RotateCcw className="h-4 w-4" />
                  Yeniden Gönder
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="!text-danger-600 !border-danger-200 hover:!bg-danger-50"
                  onClick={() => {
                    cancelMutation.mutate(inv.id, {
                      onSuccess: () => {
                        toast.success("Davet iptal edildi");
                      },
                      onError: (err) => {
                        toast.error(
                          extractErrorMessage(err, "İptal başarısız"),
                        );
                      },
                    });
                  }}
                  loading={
                    cancelMutation.isPending &&
                    cancelMutation.variables === inv.id
                  }
                >
                  <X className="h-4 w-4" />
                  İptal Et
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
