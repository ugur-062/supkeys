"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRejectSupplierApplication } from "@/hooks/use-supplier-applications";
import { REJECTION_REASONS } from "@/lib/applications/company-type";
import { cn } from "@/lib/utils";
import * as Dialog from "@radix-ui/react-dialog";
import axios from "axios";
import { X, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface RejectModalProps {
  applicationId: string;
  companyName: string;
  open: boolean;
  onClose: () => void;
  onRejected?: () => void;
}

const NOTE_MAX = 500;

function getErrorMessage(err: unknown, fallback: string) {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string | string[] } | undefined;
    if (Array.isArray(data?.message)) return data.message.join(", ");
    return data?.message ?? fallback;
  }
  return fallback;
}

export function RejectSupplierModal({
  applicationId,
  companyName,
  open,
  onClose,
  onRejected,
}: RejectModalProps) {
  const reject = useRejectSupplierApplication(applicationId);

  const [reason, setReason] = useState<string>(REJECTION_REASONS[0]);
  const [otherText, setOtherText] = useState("");
  const [otherError, setOtherError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReason(REJECTION_REASONS[0]);
      setOtherText("");
      setOtherError(null);
    }
  }, [open]);

  const isOther = reason === "__OTHER__";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    let finalReason: string;
    if (isOther) {
      const trimmed = otherText.trim();
      if (trimmed.length < 5) {
        setOtherError("Sebep en az 5 karakter olmalı");
        return;
      }
      finalReason = trimmed;
    } else {
      const note = otherText.trim();
      finalReason = note ? `${reason} — ${note}` : reason;
    }

    reject.mutate(
      { reason: finalReason },
      {
        onSuccess: () => {
          toast.success("Başvuru reddedildi, tedarikçiye e-posta gönderildi");
          onRejected?.();
          onClose();
        },
        onError: (err) =>
          toast.error(getErrorMessage(err, "Başvuru reddedilemedi")),
      },
    );
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
            "w-full max-w-md bg-white rounded-2xl shadow-2xl outline-none",
          )}
        >
          <header className="px-5 py-4 border-b border-admin-border flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-danger-50 flex items-center justify-center shrink-0">
                <XCircle className="w-5 h-5 text-danger-600" />
              </div>
              <div className="min-w-0">
                <Dialog.Title className="font-display font-bold text-lg text-admin-text">
                  Başvuruyu Reddet
                </Dialog.Title>
                <Dialog.Description className="text-sm text-admin-text-muted truncate">
                  {companyName} reddediliyor
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                aria-label="Kapat"
                className="p-1.5 rounded-lg hover:bg-surface-muted text-admin-text-muted hover:text-admin-text transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </header>

          <form onSubmit={handleSubmit} className="px-5 py-5 space-y-4">
            <Field>
              <Label htmlFor="reject-reason" required>
                Sebep
              </Label>
              <select
                id="reject-reason"
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setOtherError(null);
                }}
                className={cn(
                  "w-full px-3.5 py-2.5 rounded-lg border bg-white text-admin-text text-sm",
                  "border-admin-border-strong focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500",
                )}
              >
                {REJECTION_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
                <option value="__OTHER__">Diğer (sebep yazın)</option>
              </select>
            </Field>

            <div className="space-y-1">
              <Label htmlFor="reject-note">
                {isOther ? "Sebep" : "Ek not (opsiyonel)"}
                {isOther && (
                  <span className="text-danger-600 ml-1" aria-hidden>
                    *
                  </span>
                )}
              </Label>
              <Textarea
                id="reject-note"
                value={otherText}
                onChange={(e) => {
                  setOtherText(e.target.value.slice(0, NOTE_MAX));
                  if (otherError) setOtherError(null);
                }}
                placeholder={
                  isOther
                    ? "Örn: Tedarikçi alanı talep edilen sektör dışında"
                    : "İsterseniz ek bir açıklama yazabilirsiniz."
                }
                className="min-h-[90px]"
                hasError={!!otherError}
              />
              <div className="flex items-center justify-between text-xs">
                {otherError ? (
                  <span className="text-danger-600">{otherError}</span>
                ) : (
                  <span className="text-admin-text-muted">
                    Tedarikçiye gönderilen e-postada görünür.
                  </span>
                )}
                <span className="text-admin-text-muted tabular-nums">
                  {otherText.length} / {NOTE_MAX}
                </span>
              </div>
            </div>

            <footer className="flex items-center gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                className="flex-1"
                disabled={reject.isPending}
              >
                İptal
              </Button>
              <Button
                type="submit"
                variant="danger"
                loading={reject.isPending}
                disabled={reject.isPending}
                className="flex-1"
              >
                <XCircle className="w-4 h-4" />
                Reddet
              </Button>
            </footer>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
