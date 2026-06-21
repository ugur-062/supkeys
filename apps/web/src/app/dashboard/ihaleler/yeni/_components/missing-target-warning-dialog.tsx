"use client";

import { Button } from "@/components/catalyst/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { AlertTriangle } from "lucide-react";

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
    <Dialog open={open} onClose={onClose} size="md">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warning-50">
          <AlertTriangle className="h-5 w-5 text-warning-600" />
        </div>
        <div className="min-w-0">
          <DialogTitle>Hedef Fiyat Eksik</DialogTitle>
          <DialogDescription>
            {itemsMissingCount} kalemde hedef fiyat girilmemiş.
          </DialogDescription>
        </div>
      </div>

      <DialogBody className="space-y-4">
        <div className="rounded-lg bg-warning-50 border border-warning-200 p-3 text-sm text-warning-800 space-y-1.5">
          <p className="font-semibold">
            ⚠️ Hedef fiyat olmadan yayınlarsanız:
          </p>
          <ul className="list-disc list-inside text-xs text-warning-700/90 space-y-0.5">
            <li>Tahmini bütçe doğru hesaplanamaz</li>
            <li>Bütçe eşiğine göre çalışan onay zinciriniz tetiklenmeyebilir</li>
            <li>Tedarikçilerinize hedef fiyat referansı sunulmaz</li>
          </ul>
        </div>

        <p className="text-sm text-zinc-600 leading-relaxed">
          <strong>Not:</strong> İhale yine yayınlanır; yalnızca onay gereksinimi
          (varsa) atlanır. Eksik kalemleri doldurmak için "Geri Dön ve Düzelt"
          tercih edin.
        </p>
      </DialogBody>

      <DialogActions>
        <Button plain onClick={onClose}>
          Geri Dön ve Düzelt
        </Button>
        <Button
          color="amber"
          onClick={() => {
            onClose();
            onContinue();
          }}
        >
          Yine de Yayınla
        </Button>
      </DialogActions>
    </Dialog>
  );
}
