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
import { useCloseNoAward } from "@/hooks/use-tenant-tenders";
import { extractErrorMessage } from "@/lib/tenders/error";
import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  tenderId: string;
}

export function CloseNoAwardDialog({ open, onClose, tenderId }: Props) {
  const [reason, setReason] = useState("");
  const mutation = useCloseNoAward(tenderId);

  const reasonValid =
    reason.trim().length === 0 ||
    (reason.trim().length >= 10 && reason.trim().length <= 500);

  const handleClose = () => {
    if (!mutation.isPending) {
      setReason("");
      onClose();
    }
  };

  const handleConfirm = async () => {
    if (!reasonValid) return;
    try {
      await mutation.mutateAsync({
        reason: reason.trim() || undefined,
      });
      toast.success("İhale kazanan olmadan kapatıldı");
      setReason("");
      onClose();
    } catch (err) {
      toast.error(extractErrorMessage(err, "İşlem başarısız"));
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} size="md">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning-50">
          <AlertTriangle className="h-5 w-5 text-warning-600" />
        </div>
        <div>
          <DialogTitle>Kazanan Yok Kapat</DialogTitle>
          <DialogDescription>
            İhale kazanan tedarikçi olmadan kapanacak. Tüm aktif teklifler
            LOST'a düşer.
          </DialogDescription>
        </div>
      </div>

      <DialogBody>
        <Field
          hint="İsteğe bağlı — minimum 10, maksimum 500 karakter."
          error={!reasonValid ? "Sebep 10-500 karakter olmalı" : undefined}
        >
          <Label htmlFor="close-reason">Sebep (opsiyonel)</Label>
          <Textarea
            id="close-reason"
            rows={4}
            maxLength={500}
            placeholder="Örn. Tüm tekliflerin fiyat hedefimizin üzerinde olması…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={mutation.isPending}
            hasError={!reasonValid}
          />
        </Field>
      </DialogBody>

      <DialogActions>
        <Button plain onClick={handleClose} disabled={mutation.isPending}>
          Vazgeç
        </Button>
        <Button
          color="amber"
          onClick={handleConfirm}
          disabled={!reasonValid || mutation.isPending}
        >
          Kapat
        </Button>
      </DialogActions>
    </Dialog>
  );
}
