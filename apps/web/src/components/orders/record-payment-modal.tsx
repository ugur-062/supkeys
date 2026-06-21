"use client";

import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Select } from "@/components/catalyst/select";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CreateOrderPaymentInput } from "@/hooks/use-tenant-orders";
import { PAYMENT_METHOD_LABELS } from "@/lib/tenders/labels";
import type { Currency, PaymentMethod } from "@/lib/tenders/types";
import { Wallet } from "lucide-react";
import { useEffect, useState } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (input: CreateOrderPaymentInput) => void;
  loading: boolean;
  orderNumber: string;
  currency: Currency;
  /** Sipariş tutarından düşülen kalan — alıcıya gösterilir, tutar bunu aşamaz. */
  remaining: number;
}

const NOTE_MAX = 1000;

export function RecordPaymentModal({
  open,
  onClose,
  onConfirm,
  loading,
  orderNumber,
  currency,
  remaining,
}: Props) {
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [amount, setAmount] = useState("");
  const [chequeNo, setChequeNo] = useState("");
  const [chequeBank, setChequeBank] = useState("");
  const [chequeDueDate, setChequeDueDate] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMethod("CASH");
      setAmount("");
      setChequeNo("");
      setChequeBank("");
      setChequeDueDate("");
      setNote("");
      setError(null);
    }
  }, [open]);

  const isCheque = method === "CHEQUE";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numeric = Number(amount);
    if (!amount || Number.isNaN(numeric) || numeric <= 0) {
      setError("Geçerli bir tutar girin");
      return;
    }
    if (numeric > remaining + 1e-6) {
      setError(
        `Tutar kalan ödenecek tutarı aşıyor (kalan: ${remaining.toFixed(2)})`,
      );
      return;
    }
    if (isCheque && !chequeNo.trim()) {
      setError("Çek numarası zorunludur");
      return;
    }
    if (isCheque && !chequeDueDate) {
      setError("Çek vade tarihi zorunludur");
      return;
    }
    onConfirm({
      method,
      amount: numeric,
      currency,
      ...(isCheque
        ? {
            chequeNo: chequeNo.trim(),
            chequeBank: chequeBank.trim() || undefined,
            chequeDueDate,
          }
        : {}),
      note: note.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} size="lg">
      <DialogTitle>Ödeme Kaydet</DialogTitle>
      <DialogDescription>
        {orderNumber} için ödeme kaydı oluşturun
      </DialogDescription>
      <form onSubmit={handleSubmit}>
        <DialogBody className="space-y-4">
          <Alert variant="info">
            Bu kayıt tedarikçiye &quot;ödedim&quot; bildirimi olarak iletilir;
            tedarikçi aldığını onaylayana kadar bekleyen olarak görünür. Kalan
            ödenecek tutar: <strong>{remaining.toFixed(2)} {currency}</strong>
          </Alert>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field>
              <Label required>Ödeme Şekli</Label>
              <Select
                value={method}
                onChange={(e) => {
                  setMethod(e.target.value as PaymentMethod);
                  if (error) setError(null);
                }}
              >
                <option value="CASH">{PAYMENT_METHOD_LABELS.CASH}</option>
                <option value="CHEQUE">{PAYMENT_METHOD_LABELS.CHEQUE}</option>
              </Select>
            </Field>

            <Field>
              <Label required>Tutar ({currency})</Label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="0,00"
              />
            </Field>
          </div>

          {isCheque ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field>
                <Label required>Çek No</Label>
                <Input
                  value={chequeNo}
                  onChange={(e) => {
                    setChequeNo(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="Örn. 0012345"
                />
              </Field>
              <Field>
                <Label>Banka</Label>
                <Input
                  value={chequeBank}
                  onChange={(e) => setChequeBank(e.target.value)}
                  placeholder="Örn. Ziraat"
                />
              </Field>
              <Field>
                <Label required>Vade Tarihi</Label>
                <Input
                  type="date"
                  value={chequeDueDate}
                  onChange={(e) => {
                    setChequeDueDate(e.target.value);
                    if (error) setError(null);
                  }}
                />
              </Field>
            </div>
          ) : null}

          <Field error={error ?? undefined}>
            <div className="mb-1.5 flex items-center justify-between">
              <Label htmlFor="payment-note" className="mb-0">
                Not (opsiyonel)
              </Label>
              <span className="text-xs tabular-nums text-zinc-400">
                {note.length} / {NOTE_MAX}
              </span>
            </div>
            <Textarea
              id="payment-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
              placeholder="Örn. Havale dekontu e-posta ile gönderildi."
            />
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
            <Wallet className="h-4 w-4" />
            Ödemeyi Kaydet
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
