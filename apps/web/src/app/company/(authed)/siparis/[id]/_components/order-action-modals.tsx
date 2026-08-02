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
import { Select } from "@/components/catalyst/select";
import { useBankAccounts } from "@/hooks/use-company-bank-accounts";
import Link from "next/link";
import { Textarea } from "@/components/catalyst/textarea";
import { useState } from "react";

/** Ortak modal kabuğu yok — her biri kendi alanlarını yönetir (eski sistemle birebir). */

export function AcceptOrderModal({
  open,
  onClose,
  onSubmit,
  pending,
  bankOptional = false,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: {
    acceptedNote?: string;
    bankAccountId?: string;
  }) => void;
  pending: boolean;
  /** S1: LC/vesaik mukabilinde ödeme banka kanalından gider → banka hesabı opsiyonel. */
  bankOptional?: boolean;
}) {
  const [note, setNote] = useState("");
  // Banka bilgisi elle girilmez — Ayarlar → Banka Hesapları'ndan seçilir.
  const accounts = useBankAccounts();
  const [accountId, setAccountId] = useState("");
  const defaultId =
    accounts.data?.find((a) => a.isDefault)?.id ?? accounts.data?.[0]?.id ?? "";
  const effectiveAccountId = accountId || defaultId;

  const hasAccounts = !!accounts.data && accounts.data.length > 0;
  const bankReady = bankOptional || !!effectiveAccountId;

  const submit = () => {
    if (!bankReady) return;
    onSubmit({
      acceptedNote: note.trim() || undefined,
      bankAccountId: effectiveAccountId || undefined,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} size="lg">
      <DialogTitle>Siparişi Onayla</DialogTitle>
      <DialogDescription>
        Ödeme bilgilerinizi girin — teslim bilgisi teklifinizden alınır,
        yeniden tarih seçmeniz gerekmez.
      </DialogDescription>
      <DialogBody className="space-y-4">
        {bankOptional ? (
          <Field>
            <Label>Ödeme Hesabı</Label>
            <p className="mt-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
              Akreditif / vesaik mukabili — ödeme banka kanalından (LC/belge
              şartlarına göre) yapılır; banka hesabı seçmeniz gerekmez.
            </p>
          </Field>
        ) : (
          <Field>
            <Label>Ödeme Hesabı *</Label>
            {hasAccounts ? (
              <>
                <Select
                  value={effectiveAccountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  aria-label="Ödeme hesabı"
                >
                  {accounts.data!.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title} · {a.iban.slice(0, 6)}…{a.iban.slice(-4)}
                      {a.isDefault ? " (varsayılan)" : ""}
                    </option>
                  ))}
                </Select>
                <p className="mt-1 text-xs text-zinc-500">
                  Alıcının ödeme yapacağı hesap — siparişe işlenir (zorunlu).
                </p>
              </>
            ) : (
              <p className="mt-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Ödeme alabilmek için kayıtlı bir banka hesabı gerekli.{" "}
                <Link
                  href="/company/ayarlar/banka-hesaplari"
                  className="font-semibold underline"
                  target="_blank"
                >
                  Ayarlar → Banka Hesapları
                </Link>
                &apos;ndan ekleyin (yalnız Kurucu ekleyebilir). Hesap eklenmeden
                sipariş onaylanamaz.
              </p>
            )}
          </Field>
        )}
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
        <Button onClick={submit} disabled={pending || !bankReady}>
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
  // Teslim şekli: satıcı taşır (gönder) mı yoksa alıcı toplar (teslime hazırla) mı?
  sellerShips = true,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: { invoiceNumber: string; deliveryNote?: string }) => void;
  pending: boolean;
  sellerShips?: boolean;
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

  // Madde 17: satıcının tek adımı "Siparişi Tamamla" (fatura no ister);
  // sonrası alıcı onayı — alıcı teslim aldı deyince sipariş otomatik biter.
  const title = "Siparişi Tamamla";

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>{title}</DialogTitle>
      <DialogDescription>
        {sellerShips
          ? "Kestiğiniz faturanın numarasını girin — sipariş sizin tarafınızdan tamamlanır; alıcı teslim aldığını işaretleyince kesin olarak kapanır."
          : "Kestiğiniz faturanın numarasını girin ve malı teslime hazır işaretleyin — alıcı teslim aldığını işaretleyince sipariş kesin olarak kapanır."}
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
          <Label>
            {sellerShips ? "Gönderim Notu (opsiyonel)" : "Teslim Notu (opsiyonel)"}
          </Label>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            placeholder={
              sellerShips
                ? "Örn. Aras Kargo - 1234567890"
                : "Örn. teslim yeri / hazır olduğu saat"
            }
          />
        </Field>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose}>
          Vazgeç
        </Button>
        <Button onClick={submit} disabled={pending || !invoice.trim()}>
          {title}
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
