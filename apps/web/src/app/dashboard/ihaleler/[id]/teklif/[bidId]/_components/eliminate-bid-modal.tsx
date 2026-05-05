"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useEliminateBid } from "@/hooks/use-tenant-tenders";
import { extractErrorMessage } from "@/lib/tenders/error";
import { cn } from "@/lib/utils";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, Ban, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  tenderId: string;
  bidId: string;
  supplierName: string;
}

export function EliminateBidModal({
  open,
  onClose,
  tenderId,
  bidId,
  supplierName,
}: Props) {
  const [reason, setReason] = useState("");
  const mutation = useEliminateBid(tenderId);

  const reasonValid = reason.trim().length >= 10 && reason.trim().length <= 500;

  const handleClose = (next: boolean) => {
    if (!next && !mutation.isPending) {
      setReason("");
      onClose();
    }
  };

  const handleConfirm = async () => {
    if (!reasonValid) return;
    try {
      await mutation.mutateAsync({ bidId, reason: reason.trim() });
      toast.success("Teklif elendi, tedarikçiye bildirim gönderildi");
      setReason("");
      onClose();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Eleme başarısız"));
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-900/60 z-[60]" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[60]",
            "w-[calc(100vw-2rem)] max-w-lg bg-white rounded-2xl shadow-2xl outline-none",
          )}
        >
          <header className="px-5 py-4 border-b border-surface-border flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-danger-50 flex items-center justify-center flex-shrink-0">
                <Ban className="w-5 h-5 text-danger-600" />
              </div>
              <div>
                <Dialog.Title className="font-display font-bold text-lg text-danger-700">
                  Teklifi Ele
                </Dialog.Title>
                <Dialog.Description className="text-sm text-slate-500 mt-0.5">
                  <span className="font-semibold">{supplierName}</span>{" "}
                  firmasının teklifini elemek üzeresiniz.
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Kapat"
                disabled={mutation.isPending}
                className="p-1.5 rounded-lg hover:bg-surface-muted text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0 disabled:opacity-40"
              >
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </header>

          <div className="px-5 py-5 space-y-4">
            <div className="rounded-lg bg-warning-50 border border-warning-200 p-3 text-xs text-warning-800 flex gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                Bu işlem sonrası tedarikçiye e-posta ile bildirim gönderilir ve
                yeniden teklif verme hakkı kazanır.
              </span>
            </div>

            <Field
              hint={`${reason.length} / 500 — Bu sebep tedarikçiye e-postada gösterilir.`}
            >
              <Label htmlFor="elimination-reason">
                Eleme Sebebi <span className="text-danger-500">*</span>
              </Label>
              <Textarea
                id="elimination-reason"
                rows={4}
                maxLength={500}
                placeholder="Örn. Vergi levhası eksik, ürün spesifikasyonu uyumsuz…"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={mutation.isPending}
              />
            </Field>

            <p className="text-xs text-slate-500">
              Minimum 10 karakter zorunludur.
            </p>
          </div>

          <footer className="px-5 py-4 border-t border-surface-border flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleClose(false)}
              disabled={mutation.isPending}
              className="flex-1"
            >
              Vazgeç
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleConfirm}
              loading={mutation.isPending}
              disabled={!reasonValid || mutation.isPending}
              className="flex-1 !bg-danger-600 hover:!bg-danger-700 focus:!ring-danger-500"
            >
              <Ban className="w-4 h-4" />
              Teklifi Ele
            </Button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
