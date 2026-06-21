"use client";

import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Truck } from "lucide-react";
import { useEffect, useState } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (input: { invoiceNumber: string; deliveryNote?: string }) => void;
  loading: boolean;
  orderNumber: string;
  /** Onay anında girilen tahmini teslim tarihi (ISO). Bilgi amaçlı gösterilir. */
  expectedDeliveryDate?: string | null;
}

const NOTE_MAX = 500;
const INVOICE_MAX = 100;

export function StartDeliveryModal({
  open,
  onClose,
  onConfirm,
  loading,
  orderNumber,
  expectedDeliveryDate,
}: Props) {
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [deliveryNote, setDeliveryNote] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setInvoiceNumber("");
      setDeliveryNote("");
      setTouched(false);
    }
  }, [open]);

  const invoiceMissing = !invoiceNumber.trim();

  const expectedDateLabel = expectedDeliveryDate
    ? new Date(expectedDeliveryDate).toLocaleDateString("tr-TR", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <Dialog open={open} onClose={onClose} size="md">
      <DialogTitle>Siparişi Gönder</DialogTitle>
      <DialogDescription>{orderNumber} kargoya veriliyor</DialogDescription>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setTouched(true);
          if (invoiceMissing) return;
          onConfirm({
            invoiceNumber: invoiceNumber.trim(),
            deliveryNote: deliveryNote.trim() || undefined,
          });
        }}
      >
        <DialogBody className="space-y-4">
          <Alert variant="info">
            Gönderim başlatıldığında alıcıya e-posta ile bildirilecek.
            {expectedDateLabel ? (
              <p className="mt-1">
                Onay anında verdiğiniz tahmini teslim:{" "}
                <strong>{expectedDateLabel}</strong>
              </p>
            ) : null}
          </Alert>

          <Field
            error={
              touched && invoiceMissing ? "Fatura numarası zorunludur" : undefined
            }
          >
            <Label htmlFor="invoice-number" className="mb-1.5">
              Fatura Numarası <span className="text-danger-600">*</span>
            </Label>
            <Input
              id="invoice-number"
              value={invoiceNumber}
              onChange={(e) =>
                setInvoiceNumber(e.target.value.slice(0, INVOICE_MAX))
              }
              placeholder="Örn. SUP2026000123"
              hasError={touched && invoiceMissing}
              autoFocus
            />
            <p className="mt-1 text-xs text-zinc-500">
              Bu sipariş için kestiğiniz faturanın numarası.
            </p>
          </Field>

          <Field>
            <div className="mb-1.5 flex items-center justify-between">
              <Label htmlFor="delivery-note" className="mb-0">
                Gönderim Notu (opsiyonel)
              </Label>
              <span className="text-xs tabular-nums text-zinc-400">
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
            <p className="mt-1 text-xs text-zinc-500">
              Kargo firması, takip no veya kısa açıklama.
            </p>
          </Field>
        </DialogBody>
        <DialogActions>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={loading}
          >
            Vazgeç
          </Button>
          <Button type="submit" loading={loading} disabled={loading}>
            <Truck className="h-4 w-4" />
            Siparişi Gönder
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
