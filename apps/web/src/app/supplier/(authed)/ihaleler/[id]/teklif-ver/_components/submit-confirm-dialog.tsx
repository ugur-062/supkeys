"use client";

import { Button } from "@/components/ui/button";
import type { Currency } from "@/lib/tenders/types";
import { cn } from "@/lib/utils";
import * as Dialog from "@radix-ui/react-dialog";
import { Lock, Send, X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isSubmitting: boolean;
  isRevise: boolean;
  totalAmount: number;
  currency: Currency;
  invitedSummary?: string;
}

export function SubmitConfirmDialog({
  open,
  onClose,
  onConfirm,
  isSubmitting,
  isRevise,
  totalAmount,
  currency,
}: Props) {
  let totalLabel = "—";
  try {
    totalLabel = totalAmount.toLocaleString("tr-TR", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    });
  } catch {
    totalLabel = `${totalAmount.toFixed(2)} ${currency}`;
  }

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
              <div className="w-10 h-10 rounded-xl bg-success-50 flex items-center justify-center flex-shrink-0">
                <Send className="w-5 h-5 text-success-600" />
              </div>
              <div>
                <Dialog.Title className="font-display font-bold text-lg text-brand-900">
                  {isRevise ? "Teklifi Revize Et" : "Teklif Gönder"}
                </Dialog.Title>
                <Dialog.Description className="text-sm text-slate-500 mt-0.5">
                  {isRevise
                    ? "Mevcut teklifiniz yeni versiyonla güncellenecek."
                    : "Teklifiniz alıcıya gönderilecek."}
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Kapat"
                disabled={isSubmitting}
                className="p-1.5 rounded-lg hover:bg-surface-muted text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0 disabled:opacity-40"
              >
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </header>

          <div className="px-5 py-5 space-y-4">
            <div className="rounded-lg bg-brand-50 border border-brand-200 p-4">
              <p className="text-[11px] text-slate-500 uppercase tracking-wide font-semibold">
                Toplam Teklif Tutarınız
              </p>
              <p className="text-2xl font-display font-bold text-brand-700 mt-1">
                {totalLabel}
              </p>
            </div>

            <div className="rounded-lg bg-warning-50 border border-warning-200 p-3 text-xs text-warning-800 flex gap-2">
              <Lock className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                Teklifiniz <strong>kapalı zarf</strong> altında saklanır. Sadece
                alıcı görebilir. Gönderdikten sonra değişiklik için alıcıyla
                iletişime geçmeniz gerekir.
              </span>
            </div>
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
              className="flex-1 !bg-success-600 hover:!bg-success-700 focus:!ring-success-500"
            >
              <Send className="w-4 h-4" />
              {isRevise ? "Revizeyi Onayla" : "Teklifi Gönder"}
            </Button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
