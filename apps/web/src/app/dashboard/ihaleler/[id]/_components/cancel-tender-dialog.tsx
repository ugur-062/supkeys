"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import * as Dialog from "@radix-ui/react-dialog";
import { Ban, X } from "lucide-react";
import { useEffect, useState } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  isSubmitting: boolean;
  tenderTitle: string;
}

const REASON_MAX = 500;
const REASON_MIN = 10;

export function CancelTenderDialog({
  open,
  onClose,
  onConfirm,
  isSubmitting,
  tenderTitle,
}: Props) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  const trimmed = reason.trim();
  const valid = trimmed.length >= REASON_MIN;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || isSubmitting) return;
    onConfirm(trimmed);
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o && !isSubmitting) onClose();
      }}
    >
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
              <div className="w-10 h-10 rounded-full bg-danger-50 flex items-center justify-center shrink-0">
                <Ban className="w-5 h-5 text-danger-600" />
              </div>
              <div className="min-w-0">
                <Dialog.Title className="font-display font-bold text-lg text-brand-900">
                  İhaleyi İptal Et
                </Dialog.Title>
                <Dialog.Description className="text-sm text-slate-500 truncate">
                  {tenderTitle}
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                aria-label="Kapat"
                disabled={isSubmitting}
                className="p-1.5 rounded-lg hover:bg-surface-muted text-slate-400 hover:text-slate-600 transition-colors shrink-0 disabled:opacity-40"
              >
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </header>

          <form onSubmit={handleSubmit} className="px-5 py-5 space-y-4">
            <Field
              hint={`${trimmed.length}/${REASON_MAX} · en az ${REASON_MIN} karakter`}
            >
              <Label htmlFor="cancel-reason" required>
                İptal Sebebi
              </Label>
              <Textarea
                id="cancel-reason"
                rows={3}
                value={reason}
                maxLength={REASON_MAX}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Tedarikçilere de iletilebilecek kısa bir açıklama"
              />
            </Field>

            <p className="text-xs text-slate-500 p-3 rounded-lg bg-warning-50 border border-warning-200">
              İhale CANCELLED durumuna geçer. Davetli tedarikçiler artık teklif
              veremez.
            </p>

            <footer className="flex items-center gap-2 pt-1">
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                disabled={isSubmitting}
                className="flex-1"
              >
                Vazgeç
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={isSubmitting}
                disabled={isSubmitting || !valid}
                className="flex-1 !bg-danger-600 hover:!bg-danger-700 focus:!ring-danger-500"
              >
                <Ban className="w-4 h-4" />
                İptal Et
              </Button>
            </footer>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
