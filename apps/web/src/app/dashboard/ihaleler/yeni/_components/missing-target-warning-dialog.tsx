"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  onContinue: () => void;
  itemsMissingCount: number;
}

export function MissingTargetWarningDialog({
  open,
  onClose,
  onContinue,
  itemsMissingCount,
}: Props) {
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
            "w-[calc(100vw-2rem)] max-w-md bg-white rounded-2xl shadow-2xl outline-none",
          )}
        >
          <header className="px-5 py-4 border-b border-surface-border flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-warning-50 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-warning-600" />
              </div>
              <div className="min-w-0">
                <Dialog.Title className="font-display font-bold text-lg text-brand-900">
                  Hedef Fiyat Eksik
                </Dialog.Title>
                <Dialog.Description className="text-sm text-slate-500">
                  {itemsMissingCount} kalemde hedef fiyat girilmemiş.
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                aria-label="Kapat"
                className="p-1.5 rounded-lg hover:bg-surface-muted text-slate-400 hover:text-slate-600 transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </header>

          <div className="px-5 py-5 space-y-4">
            <div className="rounded-lg bg-warning-50 border border-warning-200 p-3 text-sm text-warning-800 space-y-1.5">
              <p className="font-semibold">
                ⚠️ Hedef fiyat olmadan yayınlarsanız:
              </p>
              <ul className="list-disc list-inside text-xs text-warning-700/90 space-y-0.5">
                <li>Tahmini bütçe doğru hesaplanamaz</li>
                <li>
                  Bütçe eşiğine göre çalışan onay zinciriniz tetiklenmeyebilir
                </li>
                <li>
                  Tedarikçilerinize hedef fiyat referansı sunulmaz
                </li>
              </ul>
            </div>

            <p className="text-sm text-slate-600 leading-relaxed">
              <strong>Not:</strong> İhale yine yayınlanır; yalnızca onay
              gereksinimi (varsa) atlanır. Eksik kalemleri doldurmak için
              "Geri Dön ve Düzelt" tercih edin.
            </p>
          </div>

          <footer className="px-5 py-4 border-t border-surface-border flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              className="flex-1"
            >
              Geri Dön ve Düzelt
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => {
                onClose();
                onContinue();
              }}
              className="flex-1 !bg-warning-600 hover:!bg-warning-700 focus:!ring-warning-500"
            >
              Yine de Yayınla
            </Button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
