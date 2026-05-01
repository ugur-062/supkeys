"use client";

import { Button } from "@/components/ui/button";
import { useApproveSupplierApplication } from "@/hooks/use-supplier-applications";
import { cn } from "@/lib/utils";
import * as Dialog from "@radix-ui/react-dialog";
import axios from "axios";
import { CheckCircle2, X } from "lucide-react";
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
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-900/60 z-[60]" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[60]",
            "w-full max-w-md bg-white rounded-2xl shadow-2xl outline-none",
          )}
        >
          <header className="px-5 py-4 border-b border-admin-border flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-success-50 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5 text-success-600" />
              </div>
              <div className="min-w-0">
                <Dialog.Title className="font-display font-bold text-lg text-admin-text">
                  Başvuruyu Onayla
                </Dialog.Title>
                <Dialog.Description className="text-sm text-admin-text-muted truncate">
                  {companyName}
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                aria-label="Kapat"
                className="p-1.5 rounded-lg hover:bg-surface-muted text-admin-text-muted hover:text-admin-text transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </header>

          <div className="px-5 py-5 space-y-3 text-sm text-admin-text">
            <p>
              Bu başvuru onaylandığında{" "}
              <strong className="font-semibold">{companyName}</strong> için{" "}
              <em>Standart</em> üyelikli tedarikçi profili ve giriş kullanıcısı
              oluşturulacak; tedarikçiye &ldquo;hesabınız aktif&rdquo;
              e-postası gönderilecek.
            </p>
            {invitedByTenantName && (
              <p className="rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-2 text-xs text-indigo-700 leading-relaxed">
                Tedarikçi{" "}
                <strong>&ldquo;{invitedByTenantName}&rdquo;</strong> tarafından
                davet edildi. Onay sonrası tenant ile{" "}
                <strong>aktif ilişki</strong> otomatik kurulacak.
              </p>
            )}
          </div>

          <footer className="px-5 py-4 border-t border-admin-border flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              className="flex-1"
              disabled={approve.isPending}
            >
              İptal
            </Button>
            <Button
              type="button"
              onClick={handleApprove}
              loading={approve.isPending}
              disabled={approve.isPending}
              className="flex-1 !bg-success-600 hover:!bg-success-700 focus:!ring-success-500"
            >
              <CheckCircle2 className="w-4 h-4" />
              Onayla
            </Button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
