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
}

const REASON_MIN = 5;
const REASON_MAX = 1000;

/** Faz 3 madde 16 — Tedarikçi ödemeyi almadığını bildirir (sebep zorunlu). */
export function RejectPaymentModal({
  open,
  onClose,
  onConfirm,
  loading,
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
      setError(`Sebep en az ${REASON_MIN} karakter olmalı`);
      return;
    }
    onConfirm(trimmed);
  };

  return (
    <Dialog open={open} onClose={onClose} size="md">
      <DialogTitle>Ödemeyi Reddet</DialogTitle>
      <DialogDescription>Bu ödemeyi almadığınızı bildirin</DialogDescription>
      <form onSubmit={handleSubmit}>
        <DialogBody className="space-y-4">
          <Alert variant="warning">
            Reddederseniz alıcı bilgilendirilecek ve kaydı düzeltebilecek.
          </Alert>

          <Field error={error ?? undefined}>
            <div className="mb-1.5 flex items-center justify-between">
              <Label htmlFor="payment-reject-reason" className="mb-0" required>
                Sebep
              </Label>
              <span className="text-xs tabular-nums text-zinc-400">
                {reason.length} / {REASON_MAX}
              </span>
            </div>
            <Textarea
              id="payment-reject-reason"
              rows={3}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value.slice(0, REASON_MAX));
                if (error) setError(null);
              }}
              placeholder="Örn. Belirtilen tutar hesabımıza ulaşmadı."
              hasError={!!error}
            />
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
            Almadım
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
