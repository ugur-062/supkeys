"use client";

import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { Currency } from "@/lib/tenders/types";
import { Send } from "lucide-react";

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
    <Dialog
      open={open}
      onClose={() => {
        if (!isSubmitting) onClose();
      }}
      size="md"
    >
      <DialogTitle>{isRevise ? "Teklifi Revize Et" : "Teklif Gönder"}</DialogTitle>
      <DialogDescription>
        {isRevise
          ? "Mevcut teklifiniz yeni versiyonla güncellenecek."
          : "Teklifiniz alıcıya gönderilecek."}
      </DialogDescription>
      <DialogBody className="space-y-4">
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            Toplam Teklif Tutarınız
          </p>
          <p className="mt-1 text-2xl font-bold text-zinc-950">{totalLabel}</p>
        </div>

        <Alert variant="warning">
          Teklifiniz <strong>kapalı zarf</strong> altında saklanır. Sadece alıcı
          görebilir. Gönderdikten sonra değişiklik için alıcıyla iletişime
          geçmeniz gerekir.
        </Alert>
      </DialogBody>
      <DialogActions>
        <Button
          type="button"
          variant="secondary"
          onClick={onClose}
          disabled={isSubmitting}
        >
          Vazgeç
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={onConfirm}
          loading={isSubmitting}
          disabled={isSubmitting}
        >
          <Send className="h-4 w-4" />
          {isRevise ? "Revizeyi Onayla" : "Teklifi Gönder"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
