"use client";

import { Button } from "@/components/ui/button";
import { useSupplierAuth } from "@/hooks/use-supplier-auth";
import { SUPPLIER_RELATION_STATUS_META } from "@/lib/supplier/status";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { Building2, Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AddInvitationModal } from "./add-invitation-modal";

export function TenantRelationsList() {
  const { tenantRelations } = useSupplierAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const invitationToken = searchParams.get("invitation");
  const [modalOpen, setModalOpen] = useState(false);

  // URL'de invitation token varsa modalı otomatik aç
  useEffect(() => {
    if (invitationToken) setModalOpen(true);
  }, [invitationToken]);

  const handleClose = () => {
    setModalOpen(false);
    // Modal kapanınca URL'den invitation parametresini temizle —
    // sayfa yenilenince modal yeniden açılmasın
    if (invitationToken) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("invitation");
      const qs = params.toString();
      router.replace(qs ? `/supplier/profil?${qs}` : "/supplier/profil");
    }
  };

  return (
    <section className="card p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display font-bold text-lg text-brand-900">
            Bağlı Olduğum Alıcılar
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {tenantRelations.length === 0
              ? "Henüz bağlı olduğunuz bir alıcı yok"
              : `${tenantRelations.length} aktif ilişki`}
          </p>
        </div>
      </div>

      {tenantRelations.length === 0 ? (
        <div className="rounded-xl border border-dashed border-surface-border bg-surface-subtle py-10 px-6 text-center">
          <div className="h-12 w-12 rounded-full bg-slate-100 mx-auto flex items-center justify-center">
            <Building2 className="h-6 w-6 text-slate-300" />
          </div>
          <p className="font-semibold text-brand-900 mt-3">
            Henüz bağlı olduğunuz bir alıcı yok
          </p>
          <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
            Bir alıcı firma sizi davet ettiğinde, davet kodu ile bağlantı
            kurabilirsiniz.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {tenantRelations.map((rel) => {
            const meta = SUPPLIER_RELATION_STATUS_META[rel.status];
            return (
              <div
                key={rel.id}
                className="border border-surface-border rounded-xl p-4 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                    <Building2 className="h-5 w-5 text-slate-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-brand-900 truncate">
                      {rel.tenantName}
                    </p>
                    <p className="text-xs text-slate-500">
                      {format(new Date(rel.createdAt), "d MMM yyyy", {
                        locale: tr,
                      })}{" "}
                      tarihinde bağlandı
                    </p>
                    {rel.status === "BLOCKED" && rel.blockedReason && (
                      <p className="text-xs text-danger-600 mt-1 truncate">
                        Engelleme sebebi: {rel.blockedReason}
                      </p>
                    )}
                  </div>
                </div>
                <span
                  className={cn(
                    "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border whitespace-nowrap",
                    meta.badgeClass,
                  )}
                >
                  {meta.label}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div className="pt-5 border-t border-surface-border space-y-2">
        <Button
          variant="secondary"
          fullWidth
          onClick={() => setModalOpen(true)}
        >
          <Plus className="h-4 w-4" />
          Yeni Davet Kodu Ekle
        </Button>
        <p className="text-xs text-slate-500 text-center">
          Bir alıcı firma sizi davet ettiyse, e-postanızdaki kodu buraya
          girerek bağlantı talebinde bulunabilirsiniz.
        </p>
      </div>

      <AddInvitationModal
        open={modalOpen}
        onClose={handleClose}
        initialToken={invitationToken}
      />
    </section>
  );
}
