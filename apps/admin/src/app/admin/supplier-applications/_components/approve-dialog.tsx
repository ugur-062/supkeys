"use client";

import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Button } from "@/components/ui/button";
import { useApproveSupplierApplication } from "@/hooks/use-supplier-applications";
import axios from "axios";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface ApproveDialogProps {
  applicationId: string;
  companyName: string;
  invitedByTenantName: string | null;
  open: boolean;
  onClose: () => void;
  onApproved?: () => void;
}

function getErrorMessage(err: unknown, fallback: string) {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string | string[] } | undefined;
    if (Array.isArray(data?.message)) return data.message.join(", ");
    return data?.message ?? fallback;
  }
  return fallback;
}

export function ApproveSupplierDialog({
  applicationId,
  companyName,
  invitedByTenantName,
  open,
  onClose,
  onApproved,
}: ApproveDialogProps) {
  const approve = useApproveSupplierApplication(applicationId);

  const handleApprove = () => {
    approve.mutate(undefined, {
      onSuccess: () => {
        toast.success("Başvuru onaylandı, tedarikçiye e-posta gönderildi");
        onApproved?.();
        onClose();
      },
      onError: (err) =>
        toast.error(getErrorMessage(err, "Başvuru onaylanamadı")),
    });
  };

  return (
    <Dialog open={open} onClose={onClose} size="md">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-success-50 flex items-center justify-center shrink-0">
          <CheckCircle2 className="w-5 h-5 text-success-600" />
        </div>
        <div className="min-w-0">
          <DialogTitle>Başvuruyu Onayla</DialogTitle>
          <DialogDescription className="truncate">
            {companyName}
          </DialogDescription>
        </div>
      </div>

      <DialogBody className="space-y-3 text-sm text-zinc-700">
        <p>
          Bu başvuru onaylandığında{" "}
          <strong className="font-semibold">{companyName}</strong> için{" "}
          <em>Standart</em> üyelikli tedarikçi profili ve giriş kullanıcısı
          oluşturulacak; tedarikçiye &ldquo;hesabınız aktif&rdquo; e-postası
          gönderilecek.
        </p>
        {invitedByTenantName && (
          <p className="rounded-lg bg-zinc-50 border border-zinc-200 px-3 py-2 text-xs text-zinc-700 leading-relaxed">
            Tedarikçi <strong>&ldquo;{invitedByTenantName}&rdquo;</strong>{" "}
            tarafından davet edildi. Onay sonrası tenant ile{" "}
            <strong>aktif ilişki</strong> otomatik kurulacak.
          </p>
        )}
      </DialogBody>

      <DialogActions>
        <Button
          type="button"
          variant="ghost"
          onClick={onClose}
          disabled={approve.isPending}
        >
          İptal
        </Button>
        <Button
          type="button"
          onClick={handleApprove}
          loading={approve.isPending}
          disabled={approve.isPending}
          className="!bg-success-600 hover:!bg-success-700"
        >
          <CheckCircle2 className="w-4 h-4" />
          Onayla
        </Button>
      </DialogActions>
    </Dialog>
  );
}
