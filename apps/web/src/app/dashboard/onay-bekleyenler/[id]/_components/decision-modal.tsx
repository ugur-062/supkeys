"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import * as Dialog from "@radix-ui/react-dialog";
import { CheckCircle2, X, XCircle } from "lucide-react";
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
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                  isReject ? "bg-danger-50" : "bg-success-50",
                )}
              >
                {isReject ? (
                  <XCircle className="w-5 h-5 text-danger-600" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 text-success-600" />
                )}
              </div>
              <div className="min-w-0">
                <Dialog.Title
                  className={cn(
                    "font-display font-bold text-lg",
                    isReject ? "text-danger-700" : "text-success-700",
                  )}
                >
                  {isReject ? "Onayı Reddet" : "Onayı Onayla"}
                </Dialog.Title>
                <Dialog.Description className="text-sm text-slate-500">
                  {isReject
                    ? "Reddetme sebebi başlatıcıya iletilecek."
                    : "Bu adımı onaylıyorsunuz."}
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
            <Field error={error ?? undefined}>
              <div className="flex items-center justify-between mb-1.5">
                <Label htmlFor="decision-note" className="mb-0" required={isReject}>
                  {isReject ? "Reddetme Sebebi" : "Onay Notu (opsiyonel)"}
                </Label>
                <span className="text-xs text-slate-400 tabular-nums">
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
                <p className="text-xs text-slate-500 mt-1">
                  Bu mesaj başlatıcıya e-posta ile iletilir.
                </p>
              ) : null}
            </Field>

            <footer className="flex items-center gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                className="flex-1"
                disabled={loading}
              >
                Vazgeç
              </Button>
              <Button
                type="submit"
                loading={loading}
                disabled={loading}
                className={cn(
                  "flex-1",
                  isReject
                    ? "!bg-danger-600 hover:!bg-danger-700 focus:!ring-danger-500"
                    : "!bg-success-600 hover:!bg-success-700 focus:!ring-success-500",
                )}
              >
                {isReject ? (
                  <XCircle className="w-4 h-4" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                {isReject ? "Reddet" : "Onayla"}
              </Button>
            </footer>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
