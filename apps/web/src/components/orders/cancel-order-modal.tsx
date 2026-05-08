"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import * as Dialog from "@radix-ui/react-dialog";
import { Ban, X } from "lucide-react";
import { useEffect, useState } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  loading: boolean;
  orderNumber: string;
}

const REASON_MIN = 10;
const REASON_MAX = 500;

export function CancelOrderModal({
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
      setError(`İptal sebebi en az ${REASON_MIN} karakter olmalı`);
      return;
    }
    onConfirm(trimmed);
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
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
              <div className="w-10 h-10 rounded-full bg-danger-50 flex items-center justify-center shrink-0">
                <Ban className="w-5 h-5 text-danger-600" />
              </div>
              <div className="min-w-0">
                <Dialog.Title className="font-display font-bold text-lg text-danger-700">
                  Siparişi İptal Et
                </Dialog.Title>
                <Dialog.Description className="text-sm text-slate-500 truncate">
                  {orderNumber} iptal ediliyor
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                aria-label="Kapat"
                className="p-1.5 rounded-lg hover:bg-surface-muted text-slate-400 hover:text-slate-600 transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </header>

          <form onSubmit={handleSubmit} className="px-5 py-5 space-y-4">
            <div className="rounded-lg bg-danger-50 border border-danger-200 p-3 text-sm text-danger-800">
              Sipariş iptal edilince tedarikçiye e-posta ile bildirilecek. Bu
              işlem geri alınamaz.
            </div>

            <Field error={error ?? undefined}>
              <div className="flex items-center justify-between mb-1.5">
                <Label htmlFor="cancel-reason" className="mb-0" required>
                  İptal Sebebi
                </Label>
                <span className="text-xs text-slate-400 tabular-nums">
                  {reason.length} / {REASON_MAX}
                </span>
              </div>
              <Textarea
                id="cancel-reason"
                rows={4}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value.slice(0, REASON_MAX));
                  if (error) setError(null);
                }}
                placeholder="Örn. İhtiyaç değişti, alternatif tedarikçiyle devam ediyoruz."
                hasError={!!error}
              />
              <p className="text-xs text-slate-500 mt-1">
                Bu mesaj tedarikçiye gönderilir.
              </p>
            </Field>

            <footer className="flex items-center gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                disabled={loading}
                className="flex-1"
              >
                Vazgeç
              </Button>
              <Button
                type="submit"
                loading={loading}
                disabled={loading}
                className="flex-1 !bg-danger-600 hover:!bg-danger-700 focus:!ring-danger-500"
              >
                <Ban className="w-4 h-4" />
                Siparişi İptal Et
              </Button>
            </footer>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
