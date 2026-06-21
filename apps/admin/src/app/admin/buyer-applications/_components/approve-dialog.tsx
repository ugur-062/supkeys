"use client";

import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Button } from "@/components/ui/button";
import { useApproveBuyerApplication } from "@/hooks/use-buyer-applications";
import axios from "axios";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface ApproveDialogProps {
  applicationId: string;
  companyName: string;
  fromDemoCompanyName: string | null;
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

export function ApproveBuyerDialog({
  applicationId,
  companyName,
  fromDemoCompanyName,
  open,
  onClose,
  onApproved,
}: ApproveDialogProps) {
  const approve = useApproveBuyerApplication(applicationId);

  const handleApprove = () => {
    approve.mutate(undefined, {
      onSuccess: () => {
        toast.success("Başvuru onaylandı, müşteriye e-posta gönderildi");
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
          <strong className="font-semibold">{companyName}</strong> için tenant ve{" "}
          <em>COMPANY_ADMIN</em> kullanıcısı oluşturulacak, müşteriye
          &ldquo;hesabınız aktif&rdquo; e-postası gönderilecek.
        </p>
        {fromDemoCompanyName && (
          <p className="rounded-lg bg-warning-50 border border-warning-200 px-3 py-2 text-xs text-warning-700 leading-relaxed">
            Bu başvuru <strong>&ldquo;{fromDemoCompanyName}&rdquo;</strong> demo
            talebinden geldi. Onay sonrası demo kaydı otomatik olarak{" "}
            <strong>Kazanıldı</strong> statüsüne geçecek.
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
