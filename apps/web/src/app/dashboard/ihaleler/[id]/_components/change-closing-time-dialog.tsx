"use client";

// V2-7 — Kapanış zamanını değiştir modal'ı.
// "Yeni Zaman Belirle" veya "İhaleyi Hemen Kapat" + zorunlu not.

import { Button } from "@/components/catalyst/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Radio, RadioGroup } from "@/components/catalyst/radio";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useChangeClosingTime } from "@/hooks/use-tenant-tenders";
import { extractErrorMessage } from "@/lib/tenders/error";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { AlertOctagon, Clock } from "lucide-react";
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
    <Dialog open={open} onClose={handleClose} size="lg">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-100">
          <Clock className="h-5 w-5 text-zinc-700" />
        </div>
        <DialogTitle>Kapanış Zamanını Değiştir</DialogTitle>
      </div>

      <DialogBody className="space-y-4">
        <Field>
          <Label>Mevcut Kapanış Tarihi</Label>
          <div className="px-3.5 py-2.5 rounded-lg ring-1 ring-zinc-950/10 bg-zinc-50 text-sm text-zinc-700">
            {format(new Date(currentCloseAt), "dd.MM.yyyy HH:mm", {
              locale: tr,
            })}
          </div>
        </Field>

        <Field>
          <Label required>Yeni Kapanış Zamanı</Label>
          <RadioGroup
            value={mode}
            onChange={(v) => setMode(v as Mode)}
            className="grid grid-cols-1 gap-2"
          >
            <div
              className={cn(
                "p-3 rounded-lg ring-1 transition-colors",
                mode === "RESCHEDULE"
                  ? "ring-2 ring-zinc-900 bg-zinc-50"
                  : "ring-zinc-950/10",
              )}
            >
              <div className="flex items-start gap-3">
                <Radio value="RESCHEDULE" className="mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-zinc-900">
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
              </div>
            </div>

            <div
              className={cn(
                "p-3 rounded-lg ring-1 transition-colors",
                mode === "CLOSE_NOW"
                  ? "ring-2 ring-danger-500 bg-danger-50/40"
                  : "ring-zinc-950/10",
              )}
            >
              <div className="flex items-start gap-3">
                <Radio value="CLOSE_NOW" className="mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-zinc-900">
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
              </div>
            </div>
          </RadioGroup>
        </Field>

        <Field
          error={
            !noteValid && note.length > 0
              ? "Not en az 5 karakter olmalı"
              : undefined
          }
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
      </DialogBody>

      <DialogActions>
        <Button plain onClick={handleClose} disabled={mutation.isPending}>
          Vazgeç
        </Button>
        <Button onClick={handleSubmit} disabled={!canSubmit || mutation.isPending}>
          {mutation.isPending ? "Gönderiliyor…" : "Tamam"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
