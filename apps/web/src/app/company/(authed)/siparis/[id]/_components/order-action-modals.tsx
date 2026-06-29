"use client";

import { Button } from "@/components/catalyst/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Field, Label } from "@/components/catalyst/fieldset";
import { Input } from "@/components/catalyst/input";
import { Textarea } from "@/components/catalyst/textarea";
import { useState } from "react";

/** Ortak modal kabuğu yok — her biri kendi alanlarını yönetir (eski sistemle birebir). */

export function AcceptOrderModal({
  open,
  onClose,
  onSubmit,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: {
    expectedDeliveryDate: string;
    acceptedNote?: string;
    bankAccountHolder?: string;
    bankIban?: string;
  }) => void;
  pending: boolean;
}) {
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [holder, setHolder] = useState("");
  const [iban, setIban] = useState("");
  const today = new Date().toISOString().slice(0, 10);

  const submit = () => {
    if (!date) return;
    onSubmit({
      expectedDeliveryDate: date,
      acceptedNote: note.trim() || undefined,
      bankAccountHolder: holder.trim() || undefined,
      bankIban: iban.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} size="lg">
      <DialogTitle>Siparişi Onayla</DialogTitle>
      <DialogDescription>
        Tahmini teslim tarihini ve ödeme bilgilerinizi girin.
      </DialogDescription>
      <DialogBody className="space-y-4">
        <Field>
          <Label>Tahmini Teslim Tarihi *</Label>
          <Input
            type="date"
            min={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field>
            <Label>Banka Hesap Sahibi</Label>
            <Input
              value={holder}
              onChange={(e) => setHolder(e.target.value)}
              placeholder="Firma / kişi adı"
            />
          </Field>
          <Field>
            <Label>IBAN</Label>
            <Input
              value={iban}
              onChange={(e) => setIban(e.target.value)}
              placeholder="TR.."
            />
          </Field>
        </div>
        <Field>
          <Label>Onay Notu (opsiyonel)</Label>
          <Textarea
            rows={2}
            maxLength={2000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose}>
          Vazgeç
        </Button>
        <Button onClick={submit} disabled={pending || !date}>
          Onayla
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function ShipOrderModal({
  open,
  onClose,
  onSubmit,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: { invoiceNumber: string; deliveryNote?: string }) => void;
  pending: boolean;
}) {
  const [invoice, setInvoice] = useState("");
  const [note, setNote] = useState("");

  const submit = () => {
    if (!invoice.trim()) return;
    onSubmit({
      invoiceNumber: invoice.trim(),
      deliveryNote: note.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Siparişi Gönder</DialogTitle>
      <DialogDescription>
        Kestiğiniz faturanın numarasını girin ve kargoya verin.
      </DialogDescription>
      <DialogBody className="space-y-4">
        <Field>
          <Label>Fatura Numarası *</Label>
          <Input
            value={invoice}
            onChange={(e) => setInvoice(e.target.value)}
            maxLength={100}
            autoFocus
          />
        </Field>
        <Field>
          <Label>Gönderim Notu (opsiyonel)</Label>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            placeholder="Örn. Aras Kargo - 1234567890"
          />
        </Field>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose}>
          Vazgeç
        </Button>
        <Button onClick={submit} disabled={pending || !invoice.trim()}>
          Siparişi Gönder
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function ReasonModal({
  open,
  onClose,
  onSubmit,
  pending,
  title,
  description,
  confirmLabel,
  minLength = 10,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
  pending: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  minLength?: number;
}) {
  const [reason, setReason] = useState("");
  const tooShort = reason.trim().length < minLength;

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>{title}</DialogTitle>
      <DialogDescription>{description}</DialogDescription>
      <DialogBody>
        <Field>
          <Label>Gerekçe *</Label>
          <Textarea
            rows={3}
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={`En az ${minLength} karakter`}
          />
        </Field>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose}>
          Vazgeç
        </Button>
        <Button
          color="red"
          onClick={() => onSubmit(reason.trim())}
          disabled={pending || tooShort}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function NoteModal({
  open,
  onClose,
  onSubmit,
  pending,
  title,
  description,
  confirmLabel,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (note?: string) => void;
  pending: boolean;
  title: string;
  description: string;
  confirmLabel: string;
}) {
  const [note, setNote] = useState("");

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>{title}</DialogTitle>
      <DialogDescription>{description}</DialogDescription>
      <DialogBody>
        <Field>
          <Label>Notunuz (opsiyonel)</Label>
          <Textarea
            rows={2}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose}>
          Vazgeç
        </Button>
        <Button onClick={() => onSubmit(note.trim() || undefined)} disabled={pending}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
