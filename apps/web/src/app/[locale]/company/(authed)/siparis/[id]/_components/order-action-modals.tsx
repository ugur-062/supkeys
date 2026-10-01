"use client";

import { useTranslations } from "next-intl";
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
import { Link } from "@/i18n/navigation";
import { Textarea } from "@/components/catalyst/textarea";
import { useState } from "react";
import { useDialogSubmitLock } from "@/hooks/use-submit-lock";

/**
 * Ortak modal kabuğu yok — her biri kendi alanlarını yönetir (eski sistemle birebir).
 * `onSubmit` iş bitince çözülen promise döner; onay düğmesi o süre ve modal
 * kapanırken senkron kilitlidir (çift tık ikinci istek atmaz — arayüz testi FX-00).
 */

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
  }) => unknown;
  pending: boolean;
  /** S1: LC/vesaik mukabilinde ödeme banka kanalından gider → banka hesabı opsiyonel. */
  bankOptional?: boolean;
}) {
  const t = useTranslations("web.panel.trade.orderActionModals");
  const [note, setNote] = useState("");
  // Banka bilgisi elle girilmez — Ayarlar → Banka Hesapları'ndan seçilir.
  const accounts = useBankAccounts();
  const [accountId, setAccountId] = useState("");
  const defaultId =
    accounts.data?.find((a) => a.isDefault)?.id ?? accounts.data?.[0]?.id ?? "";
  const effectiveAccountId = accountId || defaultId;

  const hasAccounts = !!accounts.data && accounts.data.length > 0;
  const bankReady = bankOptional || !!effectiveAccountId;
  const lock = useDialogSubmitLock(open);

  const submit = () => {
    if (!bankReady) return;
    void lock.run(() =>
      onSubmit({
        acceptedNote: note.trim() || undefined,
        bankAccountId: effectiveAccountId || undefined,
      }),
    ).catch(() => {});
  };

  return (
    <Dialog open={open} onClose={onClose} size="lg">
      <DialogTitle>{t("siparisiOnayla")}</DialogTitle>
      <DialogDescription>
        {t("odemeBilgileriniziGirinTeslimBilgisi")}
      </DialogDescription>
      {/* P1 (denetim §4.2): mantıksal form <form> içinde — Enter gönderir. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
      <DialogBody className="space-y-4">
        {bankOptional ? (
          <Field>
            <Label>{t("odemeHesabi")}</Label>
            <p className="mt-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
              {t("akreditifVesaikMukabiliOdemeBanka")}
            </p>
          </Field>
        ) : (
          <Field>
            <Label>{t("odemeHesabi2")}</Label>
            {hasAccounts ? (
              <>
                <Select
                  value={effectiveAccountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  aria-label={t("odemeHesabi3")}
                >
                  {accounts.data!.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title} · {accountTail(a)}
                      {a.isDefault ? t("varsayilan") : ""}
                    </option>
                  ))}
                </Select>
                <p className="mt-1 text-xs text-zinc-500">
                  {t("alicininOdemeYapacagiHesapSiparise")}
                </p>
              </>
            ) : (
              <p className="mt-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {t.rich("odemeAlabilmekIcinKayitliBankaHesabi", {
                  link: (chunks) => (
                    <Link
                      href="/company/ayarlar/banka-hesaplari"
                      className="font-semibold underline"
                      target="_blank"
                    >
                      {chunks}
                    </Link>
                  ),
                })}
              </p>
            )}
          </Field>
        )}
        <Field>
          <Label>{t("onayNotuOpsiyonel")}</Label>
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
          {t("vazgec")}
        </Button>
        <Button type="submit" disabled={pending || !bankReady || lock.locked}>
          {t("onayla")}
        </Button>
      </DialogActions>
      </form>
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
  onSubmit: (input: { invoiceNumber: string; deliveryNote?: string }) => unknown;
  pending: boolean;
  sellerShips?: boolean;
}) {
  const t = useTranslations("web.panel.trade.orderActionModals");
  const [invoice, setInvoice] = useState("");
  const [note, setNote] = useState("");
  const lock = useDialogSubmitLock(open);

  const submit = () => {
    if (!invoice.trim()) return;
    void lock.run(() =>
      onSubmit({
        invoiceNumber: invoice.trim(),
        deliveryNote: note.trim() || undefined,
      }),
    ).catch(() => {});
  };

  // Madde 17: satıcının tek adımı "Siparişi Tamamla" (fatura no ister);
  // sonrası alıcı onayı — alıcı teslim aldı deyince sipariş otomatik biter.
  const title = t("siparisiTamamla");

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>{title}</DialogTitle>
      <DialogDescription>
        {sellerShips
          ? t("kestiginizFaturaninNumarasiniGirinSiparis")
          : t("kestiginizFaturaninNumarasiniGirinVe")}
      </DialogDescription>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
      <DialogBody className="space-y-4">
        <Field>
          <Label>{t("faturaNumarasi")}</Label>
          <Input
            value={invoice}
            onChange={(e) => setInvoice(e.target.value)}
            maxLength={100}
            autoFocus
          />
        </Field>
        <Field>
          <Label>
            {sellerShips ? t("gonderimNotuOpsiyonel") : t("teslimNotuOpsiyonel")}
          </Label>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            placeholder={
              sellerShips
                ? t("ornArasKargo1234567890")
                : t("ornTeslimYeriHazirOldugu")
            }
          />
        </Field>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose}>
          {t("vazgec")}
        </Button>
        <Button type="submit" disabled={pending || !invoice.trim() || lock.locked}>
          {title}
        </Button>
      </DialogActions>
      </form>
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
  onSubmit: (reason: string) => unknown;
  pending: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  minLength?: number;
}) {
  const t = useTranslations("web.panel.trade.orderActionModals");
  const [reason, setReason] = useState("");
  const tooShort = reason.trim().length < minLength;
  const lock = useDialogSubmitLock(open);

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>{title}</DialogTitle>
      <DialogDescription>{description}</DialogDescription>
      <DialogBody>
        <Field>
          <Label>{t("gerekce")}</Label>
          <Textarea
            rows={3}
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("enAzKarakter", { minLength: minLength })}
          />
        </Field>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose}>
          {t("vazgec")}
        </Button>
        <Button
          color="red"
          onClick={() => void lock.run(() => onSubmit(reason.trim())).catch(() => {})}
          disabled={pending || tooShort || lock.locked}
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
  onSubmit: (note?: string) => unknown;
  pending: boolean;
  title: string;
  description: string;
  confirmLabel: string;
}) {
  const t = useTranslations("web.panel.trade.orderActionModals");
  const [note, setNote] = useState("");
  const lock = useDialogSubmitLock(open);

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>{title}</DialogTitle>
      <DialogDescription>{description}</DialogDescription>
      <DialogBody>
        <Field>
          <Label>{t("notunuzOpsiyonel")}</Label>
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
          {t("vazgec")}
        </Button>
        <Button
          onClick={() => void lock.run(() => onSubmit(note.trim() || undefined)).catch(() => {})}
          disabled={pending || lock.locked}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Hesap kısaltması: IBAN "TR3300…1234" ya da hesap no "…1234 · SWIFT" (2026-09-27). */
function accountTail(a: { iban: string | null; accountNumber: string | null; swiftBic: string | null }): string {
  if (a.iban) return `${a.iban.slice(0, 6)}…${a.iban.slice(-4)}`;
  const acct = a.accountNumber ?? "";
  return `…${acct.slice(-4)}${a.swiftBic ? ` · ${a.swiftBic}` : ""}`;
}
