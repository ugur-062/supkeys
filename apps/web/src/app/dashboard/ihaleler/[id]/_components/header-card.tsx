"use client";

import {
  CountdownFull,
  TenderLiveStatusPill,
} from "@/components/tenders/countdown-full";
import { TenderTypeBadge } from "@/components/tenders/status-badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import {
  useCancelTender,
  useDeleteTender,
  usePublishTender,
} from "@/hooks/use-tenant-tenders";
import { extractErrorMessage } from "@/lib/tenders/error";
import type { TenderDetail } from "@/lib/tenders/types";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { Award, Ban, Pencil, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { PublishConfirmDialog } from "../../yeni/_components/publish-confirm-dialog";
import { CancelTenderDialog } from "./cancel-tender-dialog";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";

export function TenderHeaderCard({ tender }: { tender: TenderDetail }) {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === "COMPANY_ADMIN";

  const [publishOpen, setPublishOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const publishMutation = usePublishTender();
  const deleteMutation = useDeleteTender();
  const cancelMutation = useCancelTender();

  const isBusy =
    publishMutation.isPending ||
    deleteMutation.isPending ||
    cancelMutation.isPending;

  const invitedCount = tender.invitations.length;

  const handlePublish = async () => {
    try {
      await publishMutation.mutateAsync(tender.id);
      toast.success(
        `İhale yayınlandı: ${tender.tenderNumber} — tedarikçilere e-posta gönderiliyor`,
      );
    } catch (err) {
      toast.error(extractErrorMessage(err, "Yayınlama başarısız"));
    } finally {
      setPublishOpen(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(tender.id);
      toast.success("Taslak silindi");
      router.push("/dashboard/ihaleler");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Silme başarısız"));
      setDeleteOpen(false);
    }
  };

  const handleCancel = async (reason: string) => {
    try {
      await cancelMutation.mutateAsync({ id: tender.id, reason });
      toast.success("İhale iptal edildi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "İptal başarısız"));
    } finally {
      setCancelOpen(false);
    }
  };

  return (
    <>
      <section className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50/60 via-white to-indigo-50/40 p-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-5">
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <code className="text-sm text-brand-700 font-mono font-semibold">
                {tender.tenderNumber}
              </code>
              <TenderTypeBadge type={tender.type} />
              <TenderLiveStatusPill status={tender.status} />
            </div>
            <h1 className="font-display font-bold text-2xl md:text-3xl text-brand-900 leading-tight">
              {tender.title}
            </h1>
            {tender.description ? (
              <p className="text-slate-600 leading-relaxed max-w-3xl">
                {tender.description}
              </p>
            ) : null}
          </div>

          <div className="flex-shrink-0 md:text-right space-y-3">
            {tender.status === "OPEN_FOR_BIDS" ? (
              <div className="md:text-right">
                <p className="text-xs text-slate-500">
                  Kalan Süre:{" "}
                  <CountdownFull deadline={tender.bidsCloseAt} />
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Kapanış:{" "}
                  {format(new Date(tender.bidsCloseAt), "d MMM yyyy HH:mm", {
                    locale: tr,
                  })}
                </p>
              </div>
            ) : tender.status === "IN_AWARD" ? (
              <div className="md:text-right space-y-2">
                <p className="text-[11px] text-slate-500">
                  Kapandı:{" "}
                  {format(new Date(tender.bidsCloseAt), "d MMM yyyy HH:mm", {
                    locale: tr,
                  })}
                </p>
                <Button variant="primary" disabled title="E.5'te aktif olacak">
                  <Award className="h-4 w-4" />
                  Kazandırmayı Tamamla
                  <span className="ml-1 px-1.5 py-0.5 bg-warning-100 text-warning-700 text-[10px] rounded-md font-semibold uppercase tracking-wide">
                    Yakında
                  </span>
                </Button>
              </div>
            ) : null}

            {/* DRAFT için aksiyonlar */}
            {tender.status === "DRAFT" && isAdmin ? (
              <div className="flex md:justify-end items-center gap-2 flex-wrap">
                <Link href={`/dashboard/ihaleler/${tender.id}/duzenle`}>
                  <Button variant="secondary" size="sm" disabled={isBusy}>
                    <Pencil className="w-4 h-4" />
                    Düzenle
                  </Button>
                </Link>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setPublishOpen(true)}
                  disabled={isBusy || invitedCount === 0}
                  className="!bg-success-600 hover:!bg-success-700 focus:!ring-success-500"
                  title={
                    invitedCount === 0
                      ? "Yayınlamak için en az 1 tedarikçi davet edilmelidir"
                      : undefined
                  }
                >
                  <Send className="w-4 h-4" />
                  Yayınla
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setDeleteOpen(true)}
                  disabled={isBusy}
                  className="!text-danger-600 !border-danger-200 hover:!bg-danger-50"
                >
                  <Trash2 className="w-4 h-4" />
                  Sil
                </Button>
              </div>
            ) : null}

            {/* OPEN_FOR_BIDS için iptal */}
            {tender.status === "OPEN_FOR_BIDS" && isAdmin ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setCancelOpen(true)}
                disabled={isBusy}
                className="!text-danger-600 !border-danger-200 hover:!bg-danger-50 mt-2"
              >
                <Ban className="w-4 h-4" />
                İhaleyi İptal Et
              </Button>
            ) : null}
          </div>
        </div>

        {/* CANCELLED açıklaması */}
        {tender.status === "CANCELLED" && tender.cancelReason ? (
          <div className="mt-4 p-3 rounded-lg bg-danger-50 border border-danger-200 text-sm">
            <p className="text-danger-800 font-semibold mb-1">
              İptal Sebebi
            </p>
            <p className="text-danger-700">{tender.cancelReason}</p>
            {tender.cancelledAt ? (
              <p className="text-xs text-danger-600 mt-1">
                {format(new Date(tender.cancelledAt), "d MMM yyyy HH:mm", {
                  locale: tr,
                })}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <PublishConfirmDialog
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        onConfirm={handlePublish}
        invitedCount={invitedCount}
        isSubmitting={publishMutation.isPending}
      />

      <DeleteConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        isSubmitting={deleteMutation.isPending}
        tenderTitle={tender.title}
      />

      <CancelTenderDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={handleCancel}
        isSubmitting={cancelMutation.isPending}
        tenderTitle={tender.title}
      />
    </>
  );
}
