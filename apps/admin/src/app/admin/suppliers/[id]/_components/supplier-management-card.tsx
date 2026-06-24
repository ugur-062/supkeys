"use client";

import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Textarea } from "@/components/catalyst/textarea";
import { Button } from "@/components/ui/button";
import {
  useUpdateAdminSupplier,
  type AdminSupplierDetail,
} from "@/hooks/use-admin-suppliers";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { Ban, Pencil, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EditSupplierMetaModal } from "./edit-supplier-meta-modal";

export function SupplierManagementCard({
  supplier,
}: {
  supplier: AdminSupplierDetail;
}) {
  const mutation = useUpdateAdminSupplier(supplier.id);
  const [editOpen, setEditOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [blockReason, setBlockReason] = useState("");

  const toggleMembership = () => {
    const next = supplier.membership === "PREMIUM" ? "STANDARD" : "PREMIUM";
    mutation.mutate(
      { membership: next },
      {
        onSuccess: () => toast.success(`Üyelik ${next} olarak güncellendi`),
        onError: (e: unknown) =>
          toast.error(e instanceof Error ? e.message : "Güncelleme hatası"),
      },
    );
  };

  const unblock = () => {
    mutation.mutate(
      { isActive: true },
      {
        onSuccess: () => toast.success("Tedarikçi engeli kaldırıldı"),
        onError: (e: unknown) =>
          toast.error(e instanceof Error ? e.message : "Güncelleme hatası"),
      },
    );
  };

  const block = () => {
    mutation.mutate(
      { isActive: false, blockedReason: blockReason.trim() || undefined },
      {
        onSuccess: () => {
          toast.success("Tedarikçi engellendi");
          setBlockOpen(false);
          setBlockReason("");
        },
        onError: (e: unknown) =>
          toast.error(e instanceof Error ? e.message : "Güncelleme hatası"),
      },
    );
  };

  return (
    <div className="admin-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-admin-text">Yönetim</h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setEditOpen(true)}
        >
          <Pencil className="h-4 w-4" />
          Bilgileri Düzenle
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {/* Üyelik */}
        <div className="rounded-xl border border-surface-border p-4">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-4 w-4 text-warning-600" />
            <p className="text-sm font-semibold text-admin-text">Üyelik</p>
          </div>
          <p className="text-xs text-admin-text-muted mb-3">
            Mevcut: <span className="font-semibold">{supplier.membership}</span>
          </p>
          <Button
            type="button"
            variant={supplier.membership === "PREMIUM" ? "secondary" : "primary"}
            size="sm"
            onClick={toggleMembership}
            disabled={mutation.isPending}
          >
            {supplier.membership === "PREMIUM"
              ? "STANDARD'a indir"
              : "PREMIUM'a yükselt"}
          </Button>
        </div>

        {/* Engel durumu */}
        <div className="rounded-xl border border-surface-border p-4">
          <div className="flex items-center gap-2 mb-1">
            {supplier.isBlocked ? (
              <Ban className="h-4 w-4 text-danger-600" />
            ) : (
              <ShieldCheck className="h-4 w-4 text-success-600" />
            )}
            <p className="text-sm font-semibold text-admin-text">
              Erişim Durumu
            </p>
          </div>
          <p className="text-xs text-admin-text-muted mb-3">
            {supplier.isBlocked ? (
              <>
                Engelli
                {supplier.blockedAt
                  ? ` · ${format(new Date(supplier.blockedAt), "d MMM yyyy", {
                      locale: tr,
                    })}`
                  : ""}
                {supplier.blockedReason ? ` · ${supplier.blockedReason}` : ""}
              </>
            ) : (
              "Aktif — giriş yapabilir"
            )}
          </p>
          {supplier.isBlocked ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={unblock}
              disabled={mutation.isPending}
            >
              Engeli Kaldır
            </Button>
          ) : (
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={() => setBlockOpen(true)}
              disabled={mutation.isPending}
            >
              Engelle
            </Button>
          )}
        </div>
      </div>

      <EditSupplierMetaModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        supplier={supplier}
      />

      {/* Engelle — sebep diyalogu */}
      <Dialog open={blockOpen} onClose={() => setBlockOpen(false)}>
        <DialogTitle>Tedarikçiyi engelle</DialogTitle>
        <DialogDescription>
          Engellenen tedarikçi giriş yapamaz. Sebep (opsiyonel) kayıt altına
          alınır.
        </DialogDescription>
        <DialogBody>
          <Textarea
            value={blockReason}
            onChange={(e) => setBlockReason(e.target.value)}
            rows={3}
            placeholder="Engelleme sebebi..."
          />
        </DialogBody>
        <DialogActions>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setBlockOpen(false)}
            disabled={mutation.isPending}
          >
            Vazgeç
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={block}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Engelleniyor..." : "Engelle"}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
