"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import * as Dialog from "@radix-ui/react-dialog";
import { Send, X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  invitedCount: number;
  isSubmitting: boolean;
}

export function PublishConfirmDialog({
  open,
  onClose,
  onConfirm,
  invitedCount,
  isSubmitting,
}: Props) {
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
              <div className="w-10 h-10 rounded-full bg-success-50 flex items-center justify-center shrink-0">
                <Send className="w-5 h-5 text-success-600" />
              </div>
              <div>
                <Dialog.Title className="font-display font-bold text-lg text-brand-900">
                  İhaleyi Yayınla
                </Dialog.Title>
                <Dialog.Description className="text-sm text-slate-500">
                  Tedarikçilere davet gönderilecek
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

          <div className="px-5 py-5 space-y-3 text-sm text-slate-700">
            <p>
              <strong className="text-brand-900">{invitedCount}</strong>{" "}
              tedarikçiye davet e-postası gönderilecek.
            </p>
            <p className="p-3 rounded-lg bg-warning-50 border border-warning-200 text-xs text-warning-800">
              Yayınladıktan sonra kalemler ve davetli tedarikçi listesi
              değiştirilemez. Sadece kapanış tarihinden önce iptal
              edebilirsiniz.
            </p>
            <p className="text-xs text-slate-500">Devam edilsin mi?</p>
          </div>

          <footer className="px-5 py-4 border-t border-surface-border flex items-center gap-2">
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
              type="button"
              variant="primary"
              onClick={onConfirm}
              loading={isSubmitting}
              disabled={isSubmitting}
              className="flex-1"
            >
              <Send className="w-4 h-4" />
              Yayınla
            </Button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
