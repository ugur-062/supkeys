"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import * as Dialog from "@radix-ui/react-dialog";
import { CheckCircle2, X } from "lucide-react";
import { useEffect, useState } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (note: string) => void;
  loading: boolean;
  orderNumber: string;
}

const NOTE_MAX = 500;

export function CompleteOrderModal({
  open,
  onClose,
  onConfirm,
  loading,
  orderNumber,
}: Props) {
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) setNote("");
  }, [open]);

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
              <div className="w-10 h-10 rounded-full bg-success-50 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5 text-success-600" />
              </div>
              <div className="min-w-0">
                <Dialog.Title className="font-display font-bold text-lg text-brand-900">
                  Teslim Aldım
                </Dialog.Title>
                <Dialog.Description className="text-sm text-slate-500 truncate">
                  {orderNumber} tamamlanıyor
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

          <form
            onSubmit={(e) => {
              e.preventDefault();
              onConfirm(note.trim());
            }}
            className="px-5 py-5 space-y-4"
          >
            <div className="rounded-lg bg-success-50 border border-success-200 p-3 text-sm text-success-800">
              Bu siparişi teslim aldığınızı onaylıyorsunuz. Sipariş tamamlanmış
              olarak işaretlenecek ve tedarikçiye e-posta gönderilecek.
            </div>

            <Field>
              <div className="flex items-center justify-between mb-1.5">
                <Label htmlFor="complete-note" className="mb-0">
                  Notunuz (opsiyonel)
                </Label>
                <span className="text-xs text-slate-400 tabular-nums">
                  {note.length} / {NOTE_MAX}
                </span>
              </div>
              <Textarea
                id="complete-note"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
                placeholder="Örn. Tüm kalemler eksiksiz teslim alındı."
              />
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
                className="flex-1 !bg-success-600 hover:!bg-success-700 focus:!ring-success-500"
              >
                <CheckCircle2 className="w-4 h-4" />
                Teslim Aldım
              </Button>
            </footer>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
