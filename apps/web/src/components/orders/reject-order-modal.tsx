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
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { XCircle } from "lucide-react";
import { useEffect, useState } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  loading: boolean;
  orderNumber: string;
}

const REASON_MIN = 10;
const REASON_MAX = 1000;

export function RejectOrderModal({
  open,
  onClose,
  onConfirm,
  loading,
  orderNumber,
}: Props) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReason("");
      setError(null);
    }
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = reason.trim();
    if (trimmed.length < REASON_MIN) {
      setError(`Red sebebi en az ${REASON_MIN} karakter olmalı`);
      return;
    }
    onConfirm(trimmed);
  };

  return (
    <Dialog open={open} onClose={onClose} size="md">
      <DialogTitle>Siparişi Reddet</DialogTitle>
      <DialogDescription>{orderNumber} reddediliyor</DialogDescription>
      <form onSubmit={handleSubmit}>
        <DialogBody className="space-y-4">
          <Alert variant="warning">
            Siparişi reddederseniz alıcıya e-posta ile bildirilecek. Bu işlem
            geri alınamaz.
          </Alert>

          <Field error={error ?? undefined}>
            <div className="mb-1.5 flex items-center justify-between">
              <Label htmlFor="reject-reason" className="mb-0" required>
                Red Sebebi
              </Label>
              <span className="text-xs tabular-nums text-zinc-400">
                {reason.length} / {REASON_MAX}
              </span>
            </div>
            <Textarea
              id="reject-reason"
              rows={4}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value.slice(0, REASON_MAX));
                if (error) setError(null);
              }}
              placeholder="Örn. Stoklarımızda istenen miktar yok, üretim takvimimiz uygun değil."
              hasError={!!error}
            />
            <p className="mt-1 text-xs text-zinc-500">
              Bu mesaj alıcıya iletilir.
            </p>
          </Field>
        </DialogBody>
        <DialogActions>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={loading}
          >
            Vazgeç
          </Button>
          <Button type="submit" loading={loading} disabled={loading}>
            <XCircle className="h-4 w-4" />
            Siparişi Reddet
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
