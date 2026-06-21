"use client";

import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Select } from "@/components/catalyst/select";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRejectSupplierApplication } from "@/hooks/use-supplier-applications";
import { REJECTION_REASONS } from "@/lib/applications/company-type";
import axios from "axios";
import { XCircle } from "lucide-react";
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
    <Dialog open={open} onClose={onClose} size="md">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-danger-50 flex items-center justify-center shrink-0">
          <XCircle className="w-5 h-5 text-danger-600" />
        </div>
        <div className="min-w-0">
          <DialogTitle>Başvuruyu Reddet</DialogTitle>
          <DialogDescription className="truncate">
            {companyName} reddediliyor
          </DialogDescription>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <DialogBody className="space-y-4">
          <Field>
            <Label htmlFor="reject-reason" required>
              Sebep
            </Label>
            <Select
              id="reject-reason"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setOtherError(null);
              }}
            >
              {REJECTION_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
              <option value="__OTHER__">Diğer (sebep yazın)</option>
            </Select>
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
              rows={4}
              hasError={!!otherError}
            />
            <div className="flex items-center justify-between text-xs">
              {otherError ? (
                <span className="text-danger-600">{otherError}</span>
              ) : (
                <span className="text-zinc-500">
                  Tedarikçiye gönderilen e-postada görünür.
                </span>
              )}
              <span className="text-zinc-500 tabular-nums">
                {otherText.length} / {NOTE_MAX}
              </span>
            </div>
          </div>
        </DialogBody>

        <DialogActions>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={reject.isPending}
          >
            İptal
          </Button>
          <Button
            type="submit"
            variant="danger"
            loading={reject.isPending}
            disabled={reject.isPending}
          >
            <XCircle className="w-4 h-4" />
            Reddet
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
