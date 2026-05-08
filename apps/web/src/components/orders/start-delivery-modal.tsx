"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import * as Dialog from "@radix-ui/react-dialog";
import { Truck, X } from "lucide-react";
import { useEffect, useState } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (input: {
    deliveryNote?: string;
    expectedDeliveryDate?: string;
  }) => void;
  loading: boolean;
  orderNumber: string;
}

const NOTE_MAX = 500;

export function StartDeliveryModal({
  open,
  onClose,
  onConfirm,
  loading,
  orderNumber,
}: Props) {
  const [deliveryNote, setDeliveryNote] = useState("");
  const [expectedDate, setExpectedDate] = useState("");

  useEffect(() => {
    if (open) {
      setDeliveryNote("");
      setExpectedDate("");
    }
  }, [open]);

  const todayStr = new Date().toISOString().split("T")[0];

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
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                <Truck className="w-5 h-5 text-blue-600" />
              </div>
              <div className="min-w-0">
                <Dialog.Title className="font-display font-bold text-lg text-brand-900">
                  Teslimat Başlat
                </Dialog.Title>
                <Dialog.Description className="text-sm text-slate-500 truncate">
                  {orderNumber} kargoya veriliyor
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
              onConfirm({
                deliveryNote: deliveryNote.trim() || undefined,
                expectedDeliveryDate: expectedDate || undefined,
              });
            }}
            className="px-5 py-5 space-y-4"
          >
            <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm text-blue-800">
              Teslimat başlatıldığında alıcıya e-posta ile bildirilecek.
            </div>

            <Field>
              <div className="flex items-center justify-between mb-1.5">
                <Label htmlFor="delivery-note" className="mb-0">
                  Teslimat Notu (opsiyonel)
                </Label>
                <span className="text-xs text-slate-400 tabular-nums">
                  {deliveryNote.length} / {NOTE_MAX}
                </span>
              </div>
              <Input
                id="delivery-note"
                value={deliveryNote}
                onChange={(e) =>
                  setDeliveryNote(e.target.value.slice(0, NOTE_MAX))
                }
                placeholder="Örn. Aras Kargo - 1234567890"
              />
              <p className="text-xs text-slate-500 mt-1">
                Kargo firması, takip no veya kısa açıklama.
              </p>
            </Field>

            <Field>
              <Label htmlFor="expected-date" className="mb-1.5">
                Tahmini Teslim Tarihi (opsiyonel)
              </Label>
              <Input
                id="expected-date"
                type="date"
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
                min={todayStr}
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
                className="flex-1 !bg-blue-600 hover:!bg-blue-700 focus:!ring-blue-500"
              >
                <Truck className="w-4 h-4" />
                Teslimat Başlat
              </Button>
            </footer>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
