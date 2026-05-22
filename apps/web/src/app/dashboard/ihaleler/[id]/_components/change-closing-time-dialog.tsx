"use client";

// V2-7 — Kapanış zamanını değiştir modal'ı.
// "Yeni Zaman Belirle" veya "İhaleyi Hemen Kapat" + zorunlu not.

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useChangeClosingTime } from "@/hooks/use-tenant-tenders";
import { extractErrorMessage } from "@/lib/tenders/error";
import { cn } from "@/lib/utils";
import * as Dialog from "@radix-ui/react-dialog";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { AlertOctagon, Clock, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  tenderId: string;
  currentCloseAt: string; // ISO
}

type Mode = "RESCHEDULE" | "CLOSE_NOW";

export function ChangeClosingTimeDialog({
  open,
  onClose,
  tenderId,
  currentCloseAt,
}: Props) {
  const [mode, setMode] = useState<Mode>("RESCHEDULE");
  const [newCloseAt, setNewCloseAt] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const mutation = useChangeClosingTime(tenderId);

  const reset = () => {
    setMode("RESCHEDULE");
    setNewCloseAt("");
    setNote("");
  };

  const handleClose = () => {
    if (mutation.isPending) return;
    reset();
    onClose();
  };

  const noteValid = note.trim().length >= 5;
  const rescheduleValid =
    mode === "RESCHEDULE" &&
    newCloseAt.length > 0 &&
    new Date(newCloseAt).getTime() > Date.now();
  const closeNowValid = mode === "CLOSE_NOW";
  const canSubmit = noteValid && (rescheduleValid || closeNowValid);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    try {
      const res = await mutation.mutateAsync({
        closeNow: mode === "CLOSE_NOW",
        newCloseAt:
          mode === "RESCHEDULE"
            ? new Date(newCloseAt).toISOString()
            : undefined,
        note: note.trim(),
      });
      toast.success(
        mode === "CLOSE_NOW"
          ? `İhale kapatıldı, ${res.notifiedCount} tedarikçiye e-posta gönderildi`
          : `Yeni kapanış kaydedildi, ${res.notifiedCount} tedarikçiye e-posta gönderildi`,
      );
      reset();
      onClose();
    } catch (err) {
      toast.error(extractErrorMessage(err, "İşlem başarısız"));
    }
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) handleClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-900/60 z-[60]" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[60]",
            "w-[calc(100vw-2rem)] max-w-lg bg-white rounded-2xl shadow-2xl outline-none",
          )}
        >
          <header className="px-5 py-4 border-b border-surface-border flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5 text-brand-600" />
              </div>
              <Dialog.Title className="font-display font-bold text-lg text-brand-900">
                Kapanış Zamanını Değiştir
              </Dialog.Title>
            </div>
            <button
              type="button"
              onClick={handleClose}
              disabled={mutation.isPending}
              className="text-slate-400 hover:text-slate-600 disabled:opacity-40"
              aria-label="Kapat"
            >
              <X className="w-5 h-5" />
            </button>
          </header>

          <div className="px-5 py-5 space-y-4">
            <Field>
              <Label>Mevcut Kapanış Tarihi</Label>
              <div className="px-3.5 py-2.5 rounded-lg border border-surface-border bg-slate-50 text-sm text-slate-700">
                {format(new Date(currentCloseAt), "dd.MM.yyyy HH:mm", {
                  locale: tr,
                })}
              </div>
            </Field>

            <Field>
              <Label required>Yeni Kapanış Zamanı</Label>
              <div className="grid grid-cols-1 gap-2">
                <label className="flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50/40 border-slate-200">
                  <input
                    type="radio"
                    name="closing-mode"
                    value="RESCHEDULE"
                    checked={mode === "RESCHEDULE"}
                    onChange={() => setMode("RESCHEDULE")}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-brand-900">
                      Yeni Zaman Belirle
                    </p>
                    {mode === "RESCHEDULE" ? (
                      <Input
                        type="datetime-local"
                        className="mt-2"
                        value={newCloseAt}
                        onChange={(e) => setNewCloseAt(e.target.value)}
                      />
                    ) : null}
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors has-[:checked]:border-danger-500 has-[:checked]:bg-danger-50/40 border-slate-200">
                  <input
                    type="radio"
                    name="closing-mode"
                    value="CLOSE_NOW"
                    checked={mode === "CLOSE_NOW"}
                    onChange={() => setMode("CLOSE_NOW")}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-brand-900">
                      İhaleyi Hemen Kapat
                    </p>
                    {mode === "CLOSE_NOW" ? (
                      <div className="mt-2 p-2.5 rounded-md bg-danger-50 border border-danger-200 text-xs text-danger-800 flex items-start gap-2">
                        <AlertOctagon className="w-4 h-4 text-danger-600 flex-shrink-0 mt-0.5" />
                        <p>
                          Bu seçimi onayladığınız anda ihale kapatılacaktır. Tüm
                          PENDING davetler EXPIRED olur, kapanış e-postaları
                          tedarikçilere gönderilir.
                        </p>
                      </div>
                    ) : null}
                  </div>
                </label>
              </div>
            </Field>

            <Field
              error={!noteValid && note.length > 0 ? "Not en az 5 karakter olmalı" : undefined}
              hint="Değişiklik sebebiniz katılımcılara e-posta olarak iletilecektir."
            >
              <Label htmlFor="closing-note" required>
                Not
              </Label>
              <Textarea
                id="closing-note"
                rows={3}
                placeholder="Ör. Beklediğimizden fazla teklif geldi, süreyi kısaltıyoruz."
                hasError={!noteValid && note.length > 0}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={1000}
              />
            </Field>
          </div>

          <footer className="px-5 py-4 border-t border-surface-border flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              onClick={handleClose}
              disabled={mutation.isPending}
            >
              Vazgeç
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={!canSubmit || mutation.isPending}
            >
              {mutation.isPending ? "Gönderiliyor…" : "Tamam"}
            </Button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
