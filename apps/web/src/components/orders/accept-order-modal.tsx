"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import * as Dialog from "@radix-ui/react-dialog";
import { ThumbsUp, X } from "lucide-react";
import { useEffect, useState } from "react";

interface AcceptInput {
  expectedDeliveryDate: string;
  acceptedNote?: string;
  bankAccountHolder?: string;
  bankIban?: string;
  invoiceDate?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (input: AcceptInput) => void;
  loading: boolean;
  orderNumber: string;
}

const NOTE_MAX = 2000;
const HOLDER_MAX = 120;
const IBAN_MAX = 64;

export function AcceptOrderModal({
  open,
  onClose,
  onConfirm,
  loading,
  orderNumber,
}: Props) {
  const [expectedDate, setExpectedDate] = useState("");
  const [note, setNote] = useState("");
  const [holder, setHolder] = useState("");
  const [iban, setIban] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setExpectedDate("");
      setNote("");
      setHolder("");
      setIban("");
      setInvoiceDate("");
      setTouched(false);
    }
  }, [open]);

  const todayStr = new Date().toISOString().split("T")[0];
  const expectedMissing = !expectedDate;

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
            "w-[calc(100vw-2rem)] max-w-lg bg-white rounded-2xl shadow-2xl outline-none",
            "max-h-[90vh] overflow-hidden flex flex-col",
          )}
        >
          <header className="px-5 py-4 border-b border-surface-border flex items-start justify-between gap-3 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center shrink-0">
                <ThumbsUp className="w-5 h-5 text-brand-600" />
              </div>
              <div className="min-w-0">
                <Dialog.Title className="font-display font-bold text-lg text-brand-900">
                  Siparişi Onayla
                </Dialog.Title>
                <Dialog.Description className="text-sm text-slate-500 truncate">
                  {orderNumber} onaylanıyor
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
              setTouched(true);
              if (expectedMissing) return;
              onConfirm({
                expectedDeliveryDate: expectedDate,
                acceptedNote: note.trim() || undefined,
                bankAccountHolder: holder.trim() || undefined,
                bankIban: iban.trim() || undefined,
                invoiceDate: invoiceDate || undefined,
              });
            }}
            className="px-5 py-5 space-y-4 overflow-y-auto"
          >
            <div className="rounded-lg bg-brand-50 border border-brand-200 p-3 text-sm text-brand-800">
              Onayladığınızda sipariş alıcının panelinde onaylı görünür ve
              tedarikçi bilgileriniz alıcıya iletilir.
            </div>

            <Field error={touched && expectedMissing ? "Tahmini teslim tarihi zorunludur" : undefined}>
              <Label htmlFor="expected-date" className="mb-1.5">
                Tahmini Teslim Tarihi <span className="text-danger-600">*</span>
              </Label>
              <Input
                id="expected-date"
                type="date"
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
                min={todayStr}
                hasError={touched && expectedMissing}
              />
            </Field>

            <Field>
              <div className="flex items-center justify-between mb-1.5">
                <Label htmlFor="accept-note" className="mb-0">
                  Onay Notu (opsiyonel)
                </Label>
                <span className="text-xs text-slate-400 tabular-nums">
                  {note.length} / {NOTE_MAX}
                </span>
              </div>
              <Textarea
                id="accept-note"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
                placeholder="Örn. Üretim 2 hafta içinde tamamlanır, kargo Aras Kargo ile gönderilir."
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field>
                <Label htmlFor="bank-holder" className="mb-1.5">
                  Hesap Sahibi (opsiyonel)
                </Label>
                <Input
                  id="bank-holder"
                  value={holder}
                  onChange={(e) => setHolder(e.target.value.slice(0, HOLDER_MAX))}
                  placeholder="Firma adı"
                />
              </Field>
              <Field>
                <Label htmlFor="bank-iban" className="mb-1.5">
                  IBAN (opsiyonel)
                </Label>
                <Input
                  id="bank-iban"
                  value={iban}
                  onChange={(e) => setIban(e.target.value.slice(0, IBAN_MAX))}
                  placeholder="TR.."
                />
              </Field>
            </div>

            <Field>
              <Label htmlFor="invoice-date" className="mb-1.5">
                Fatura Kesim Tarihi (opsiyonel)
              </Label>
              <Input
                id="invoice-date"
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
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
                className="flex-1 !bg-brand-600 hover:!bg-brand-700 focus:!ring-brand-500"
              >
                <ThumbsUp className="w-4 h-4" />
                Onayla
              </Button>
            </footer>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
