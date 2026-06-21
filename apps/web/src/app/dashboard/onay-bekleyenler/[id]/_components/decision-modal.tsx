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
import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";

interface Props {
  mode: "approve" | "reject";
  open: boolean;
  onClose: () => void;
  onConfirm: (note: string) => void;
  loading: boolean;
}

const REJECT_MIN = 10;
const NOTE_MAX = 1000;

export function DecisionModal({
  mode,
  open,
  onClose,
  onConfirm,
  loading,
}: Props) {
  const isReject = mode === "reject";
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setNote("");
      setError(null);
    }
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = note.trim();
    if (isReject && trimmed.length < REJECT_MIN) {
      setError(`Reddetme nedeni en az ${REJECT_MIN} karakter olmalı`);
      return;
    }
    onConfirm(trimmed);
  };

  return (
    <Dialog open={open} onClose={onClose} size="md">
      <form onSubmit={handleSubmit}>
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
              isReject ? "bg-danger-50" : "bg-success-50",
            )}
          >
            {isReject ? (
              <XCircle className="h-5 w-5 text-danger-600" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-success-600" />
            )}
          </div>
          <div className="min-w-0">
            <DialogTitle
              className={isReject ? "text-danger-700" : "text-success-700"}
            >
              {isReject ? "Onayı Reddet" : "Onayı Onayla"}
            </DialogTitle>
            <DialogDescription>
              {isReject
                ? "Reddetme sebebi ilgili kişiye iletilecek."
                : "Bu adımı onaylıyorsunuz."}
            </DialogDescription>
          </div>
        </div>

        <DialogBody>
          <Field error={error ?? undefined}>
            <div className="flex items-center justify-between mb-1.5">
              <Label htmlFor="decision-note" className="mb-0" required={isReject}>
                {isReject ? "Reddetme Sebebi" : "Onay Notu (opsiyonel)"}
              </Label>
              <span className="text-xs text-zinc-400 tabular-nums">
                {note.length} / {NOTE_MAX}
              </span>
            </div>
            <Textarea
              id="decision-note"
              rows={4}
              value={note}
              onChange={(e) => {
                setNote(e.target.value.slice(0, NOTE_MAX));
                if (error) setError(null);
              }}
              placeholder={
                isReject
                  ? "Örn. İhale tutarı belgelenmemiş, hedef fiyatlar eksik."
                  : "Örn. Bütçe ve şartlar uygun, onaylıyorum."
              }
              hasError={!!error}
            />
            {isReject ? (
              <p className="text-xs text-zinc-500 mt-1">
                Bu mesaj ilgili kişiye e-posta ile iletilir.
              </p>
            ) : null}
          </Field>
        </DialogBody>

        <DialogActions>
          <Button plain onClick={onClose} disabled={loading}>
            Vazgeç
          </Button>
          <Button
            type="submit"
            color={isReject ? "red" : "green"}
            disabled={loading}
          >
            {isReject ? (
              <XCircle data-slot="icon" />
            ) : (
              <CheckCircle2 data-slot="icon" />
            )}
            {isReject ? "Reddet" : "Onayla"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
