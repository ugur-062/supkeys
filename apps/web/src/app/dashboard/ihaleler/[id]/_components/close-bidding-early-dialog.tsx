"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, Timer, X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isSubmitting: boolean;
  tenderTitle: string;
  submittedBidCount: number;
}

export function CloseBiddingEarlyDialog({
  open,
  onClose,
  onConfirm,
  isSubmitting,
  tenderTitle,
  submittedBidCount,
}: Props) {
  const hasBids = submittedBidCount > 0;

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
              <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center shrink-0">
                <Timer className="w-5 h-5 text-purple-600" />
              </div>
              <div className="min-w-0">
                <Dialog.Title className="font-display font-bold text-lg text-brand-900">
                  İhaleyi Erken Kapat
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

          <div className="px-5 py-5 space-y-4">
            <p className="text-sm text-slate-700">
              Süreyi beklemeden ihaleyi kapatıp kazandırma aşamasına geçeceksiniz.
            </p>

            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm">
              <p className="text-slate-700">
                <strong className="font-mono tabular-nums">
                  {submittedBidCount}
                </strong>{" "}
                gönderilmiş teklif var.
              </p>
              <ul className="mt-2 text-xs text-slate-600 list-disc list-inside space-y-0.5">
                <li>Açık davetler iptal edilir (EXPIRED).</li>
                <li>Tedarikçilere ihalenin kapandığı e-postası gönderilir.</li>
                <li>İhale IN_AWARD durumuna geçer.</li>
              </ul>
            </div>

            {!hasBids ? (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-warning-50 border border-warning-200 text-xs text-warning-800">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p>
                  Henüz hiç teklif gelmedi. Yine de kapatabilirsiniz; ardından
                  &quot;Kazanan Yok Kapat&quot; ile ihaleyi sonlandırabilirsiniz.
                </p>
              </div>
            ) : null}

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
                type="button"
                variant="primary"
                onClick={onConfirm}
                loading={isSubmitting}
                disabled={isSubmitting}
                className="flex-1 !bg-purple-600 hover:!bg-purple-700 focus:!ring-purple-500"
              >
                <Timer className="w-4 h-4" />
                Kapat ve Kazandır
              </Button>
            </footer>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
