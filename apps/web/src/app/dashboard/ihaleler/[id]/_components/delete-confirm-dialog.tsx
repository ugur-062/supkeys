"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import * as Dialog from "@radix-ui/react-dialog";
import { Trash2, X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isSubmitting: boolean;
  tenderTitle: string;
}

export function DeleteConfirmDialog({
  open,
  onClose,
  onConfirm,
  isSubmitting,
  tenderTitle,
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
              <div className="w-10 h-10 rounded-full bg-danger-50 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-danger-600" />
              </div>
              <div className="min-w-0">
                <Dialog.Title className="font-display font-bold text-lg text-brand-900">
                  Taslağı Sil
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

          <div className="px-5 py-5 text-sm text-slate-700">
            Bu taslak ihale ve içindeki tüm kalemler/davetler/dosyalar kalıcı
            olarak silinecek. İşlem geri alınamaz.
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
              className="flex-1 !bg-danger-600 hover:!bg-danger-700 focus:!ring-danger-500"
            >
              <Trash2 className="w-4 h-4" />
              Kalıcı Olarak Sil
            </Button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
