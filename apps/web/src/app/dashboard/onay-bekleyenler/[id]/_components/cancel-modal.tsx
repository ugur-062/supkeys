"use client";

import { Button } from "@/components/catalyst/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Ban } from "lucide-react";
import { useEffect, useState } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  loading: boolean;
  approvalType: "TENDER_PUBLISH" | "TENDER_AWARD";
}

const REASON_MAX = 500;

export function CancelModal({
  open,
  onClose,
  onConfirm,
  loading,
  approvalType,
}: Props) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  const reverseLabel =
    approvalType === "TENDER_PUBLISH"
      ? "İhale taslak (DRAFT) durumuna geri dönecek ve düzenleyebileceksiniz."
      : "İhale kazandırma (IN_AWARD) aşamasına geri dönecek ve kararlarınızı düzenleyebileceksiniz.";

  return (
    <Dialog open={open} onClose={onClose} size="md">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onConfirm(reason.trim());
        }}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warning-50">
            <Ban className="h-5 w-5 text-warning-600" />
          </div>
          <div className="min-w-0">
            <DialogTitle>Onay Sürecini İptal Et</DialogTitle>
            <DialogDescription>
              Aktif onay süreciniz sonlandırılacak.
            </DialogDescription>
          </div>
        </div>

        <DialogBody className="space-y-4">
          <div className="rounded-lg bg-warning-50 border border-warning-200 p-3 text-sm">
            <p className="font-semibold text-warning-700">⚠️ İptal sonrası:</p>
            <p className="text-warning-700/90 mt-1">{reverseLabel}</p>
          </div>

          <Field>
            <div className="flex items-center justify-between mb-1.5">
              <Label htmlFor="cancel-reason" className="mb-0">
                İptal Sebebi (opsiyonel)
              </Label>
              <span className="text-xs text-zinc-400 tabular-nums">
                {reason.length} / {REASON_MAX}
              </span>
            </div>
            <Textarea
              id="cancel-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, REASON_MAX))}
              placeholder="Örn. Hedef fiyatları güncellemem gerekiyor."
            />
          </Field>
        </DialogBody>

        <DialogActions>
          <Button plain onClick={onClose} disabled={loading}>
            Vazgeç
          </Button>
          <Button type="submit" color="amber" disabled={loading}>
            <Ban data-slot="icon" />
            Onayı İptal Et
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
