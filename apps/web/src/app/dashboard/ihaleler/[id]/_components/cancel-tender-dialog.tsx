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
  isSubmitting: boolean;
  tenderTitle: string;
}

const REASON_MAX = 500;
const REASON_MIN = 10;

export function CancelTenderDialog({
  open,
  onClose,
  onConfirm,
  isSubmitting,
  tenderTitle,
}: Props) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  const trimmed = reason.trim();
  const valid = trimmed.length >= REASON_MIN;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || isSubmitting) return;
    onConfirm(trimmed);
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!isSubmitting) onClose();
      }}
      size="md"
    >
      <form onSubmit={handleSubmit}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger-50">
            <Ban className="h-5 w-5 text-danger-600" />
          </div>
          <div className="min-w-0">
            <DialogTitle>İhaleyi İptal Et</DialogTitle>
            <DialogDescription className="truncate">
              {tenderTitle}
            </DialogDescription>
          </div>
        </div>

        <DialogBody className="space-y-4">
          <Field
            hint={`${trimmed.length}/${REASON_MAX} · en az ${REASON_MIN} karakter`}
          >
            <Label htmlFor="cancel-reason" required>
              İptal Sebebi
            </Label>
            <Textarea
              id="cancel-reason"
              rows={3}
              value={reason}
              maxLength={REASON_MAX}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Tedarikçilere de iletilebilecek kısa bir açıklama"
            />
          </Field>

          <p className="text-xs text-zinc-500 p-3 rounded-lg bg-warning-50 border border-warning-200">
            İhale CANCELLED durumuna geçer. Davetli tedarikçiler artık teklif
            veremez.
          </p>
        </DialogBody>

        <DialogActions>
          <Button plain onClick={onClose} disabled={isSubmitting}>
            Vazgeç
          </Button>
          <Button type="submit" color="red" disabled={isSubmitting || !valid}>
            <Ban data-slot="icon" />
            İptal Et
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
