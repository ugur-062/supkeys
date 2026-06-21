"use client";

import { Button } from "@/components/catalyst/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Trash2 } from "lucide-react";

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
    <Dialog
      open={open}
      onClose={() => {
        if (!isSubmitting) onClose();
      }}
      size="md"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger-50">
          <Trash2 className="h-5 w-5 text-danger-600" />
        </div>
        <div className="min-w-0">
          <DialogTitle>Taslağı Sil</DialogTitle>
          <DialogDescription className="truncate">
            {tenderTitle}
          </DialogDescription>
        </div>
      </div>

      <DialogBody className="text-sm text-zinc-700">
        Bu taslak ihale ve içindeki tüm kalemler/davetler/dosyalar kalıcı olarak
        silinecek. İşlem geri alınamaz.
      </DialogBody>

      <DialogActions>
        <Button plain onClick={onClose} disabled={isSubmitting}>
          Vazgeç
        </Button>
        <Button color="red" onClick={onConfirm} disabled={isSubmitting}>
          <Trash2 data-slot="icon" />
          Kalıcı Olarak Sil
        </Button>
      </DialogActions>
    </Dialog>
  );
}
