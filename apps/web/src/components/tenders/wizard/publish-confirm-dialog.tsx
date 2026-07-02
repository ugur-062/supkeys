"use client";

import { Button } from "@/components/catalyst/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Send } from "lucide-react";

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
    <Dialog
      open={open}
      onClose={() => {
        if (!isSubmitting) onClose();
      }}
      size="md"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success-50">
          <Send className="h-5 w-5 text-success-600" />
        </div>
        <div>
          <DialogTitle>İhaleyi Yayınla</DialogTitle>
          <DialogDescription>
            Tedarikçilere davet gönderilecek
          </DialogDescription>
        </div>
      </div>

      <DialogBody className="space-y-3 text-sm text-zinc-700">
        <p>
          <strong className="text-zinc-900">{invitedCount}</strong> tedarikçiye
          davet e-postası gönderilecek.
        </p>
        <p className="p-3 rounded-lg bg-warning-50 border border-warning-200 text-xs text-warning-800">
          İlk teklif geldikten sonra kalemler değiştirilemez. Yayın sonrası
          yeni tedarikçi davet edilebilir; kapanıştan önce iptal mümkündür.
        </p>
        <p className="text-xs text-zinc-500">Devam edilsin mi?</p>
      </DialogBody>

      <DialogActions>
        <Button plain onClick={onClose} disabled={isSubmitting}>
          Vazgeç
        </Button>
        <Button onClick={onConfirm} disabled={isSubmitting}>
          <Send data-slot="icon" />
          Yayınla
        </Button>
      </DialogActions>
    </Dialog>
  );
}
