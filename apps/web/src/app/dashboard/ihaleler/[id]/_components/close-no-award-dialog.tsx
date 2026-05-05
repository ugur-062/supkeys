"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCloseNoAward } from "@/hooks/use-tenant-tenders";
import { extractErrorMessage } from "@/lib/tenders/error";
import { cn } from "@/lib/utils";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  tenderId: string;
}

export function CloseNoAwardDialog({ open, onClose, tenderId }: Props) {
  const [reason, setReason] = useState("");
  const mutation = useCloseNoAward(tenderId);

  const reasonValid =
    reason.trim().length === 0 ||
    (reason.trim().length >= 10 && reason.trim().length <= 500);

  const handleClose = (next: boolean) => {
    if (!next && !mutation.isPending) {
      setReason("");
      onClose();
    }
  };

  const handleConfirm = async () => {
    if (!reasonValid) return;
    try {
      await mutation.mutateAsync({
        reason: reason.trim() || undefined,
      });
      toast.success("İhale kazanan olmadan kapatıldı");
      setReason("");
      onClose();
    } catch (err) {
      toast.error(extractErrorMessage(err, "İşlem başarısız"));
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-900/60 z-[60]" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[60]",
            "w-[calc(100vw-2rem)] max-w-md bg-white rounded-2xl shadow-2xl outline-none",
          )}
        >
          <header className="px-5 py-4 border-b border-surface-border flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-warning-50 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-warning-600" />
              </div>
              <div>
                <Dialog.Title className="font-display font-bold text-lg text-brand-900">
                  Kazanan Yok Kapat
                </Dialog.Title>
                <Dialog.Description className="text-sm text-slate-500 mt-0.5">
                  İhale kazanan tedarikçi olmadan kapanacak. Tüm aktif teklifler
                  LOST'a düşer.
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
            <Field
              hint="İsteğe bağlı — minimum 10, maksimum 500 karakter."
              error={!reasonValid ? "Sebep 10-500 karakter olmalı" : undefined}
            >
              <Label htmlFor="close-reason">Sebep (opsiyonel)</Label>
              <Textarea
                id="close-reason"
                rows={4}
                maxLength={500}
                placeholder="Örn. Tüm tekliflerin fiyat hedefimizin üzerinde olması…"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={mutation.isPending}
                hasError={!reasonValid}
              />
            </Field>
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
              className="flex-1 !bg-warning-600 hover:!bg-warning-700 focus:!ring-warning-500"
            >
              Kapat
            </Button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
