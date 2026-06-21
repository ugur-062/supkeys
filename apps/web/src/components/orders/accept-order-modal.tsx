"use client";

import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Select } from "@/components/catalyst/select";
import { AttachmentList } from "@/components/attachments/attachment-list";
import { AttachmentUpload } from "@/components/attachments/attachment-upload";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAttachments } from "@/hooks/use-attachments";
import { useSupplierBanks } from "@/hooks/use-supplier-banks";
import { ThumbsUp } from "lucide-react";
import { useEffect, useState } from "react";

interface AcceptInput {
  expectedDeliveryDate: string;
  acceptedNote?: string;
  // G6 madde 20 — kayıtlı bankadan seçim
  bankId: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (input: AcceptInput) => void;
  loading: boolean;
  orderNumber: string;
  /** Madde 33 — nakit ödemeli sipariş: onaydan önce teminat mektubu zorunlu. */
  orderId: string;
  cashPayment?: boolean;
}

const NOTE_MAX = 2000;

export function AcceptOrderModal({
  open,
  onClose,
  onConfirm,
  loading,
  orderNumber,
  orderId,
  cashPayment = false,
}: Props) {
  const { data: banks } = useSupplierBanks();
  const { data: guaranteeFiles } = useAttachments(
    "supplier",
    "ORDER_GUARANTEE_LETTER",
    orderId,
    open && cashPayment,
  );
  const guaranteeMissing =
    cashPayment && (guaranteeFiles?.length ?? 0) === 0;
  const [expectedDate, setExpectedDate] = useState("");
  const [note, setNote] = useState("");
  const [bankId, setBankId] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setExpectedDate("");
      setNote("");
      // Varsayılan banka varsa otomatik seç.
      const def = banks?.find((b) => b.isDefault) ?? banks?.[0];
      setBankId(def?.id ?? "");
      setTouched(false);
    }
  }, [open, banks]);

  const todayStr = new Date().toISOString().split("T")[0];
  const expectedMissing = !expectedDate;
  const hasBanks = (banks?.length ?? 0) > 0;
  const bankMissing = !bankId;

  return (
    <Dialog open={open} onClose={onClose} size="lg">
      <DialogTitle>Siparişi Onayla</DialogTitle>
      <DialogDescription>{orderNumber} onaylanıyor</DialogDescription>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setTouched(true);
          if (expectedMissing || bankMissing || guaranteeMissing) return;
          onConfirm({
            expectedDeliveryDate: expectedDate,
            acceptedNote: note.trim() || undefined,
            bankId,
          });
        }}
      >
        <DialogBody className="space-y-4">
          <Alert variant="info">
            Onayladığınızda sipariş alıcının panelinde onaylı görünür ve
            tedarikçi bilgileriniz alıcıya iletilir.
          </Alert>

          <Field
            error={
              touched && expectedMissing
                ? "Tahmini teslim tarihi zorunludur"
                : undefined
            }
          >
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
            <div className="mb-1.5 flex items-center justify-between">
              <Label htmlFor="accept-note" className="mb-0">
                Onay Notu (opsiyonel)
              </Label>
              <span className="text-xs tabular-nums text-zinc-400">
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

          <Field
            error={
              touched && bankMissing && hasBanks
                ? "Bir banka hesabı seçin"
                : undefined
            }
          >
            <Label htmlFor="bank-select" className="mb-1.5">
              Ödeme Alınacak Banka Hesabı{" "}
              <span className="text-danger-600">*</span>
            </Label>
            {hasBanks ? (
              <Select
                id="bank-select"
                value={bankId}
                onChange={(e) => setBankId(e.target.value)}
              >
                <option value="">Seçiniz…</option>
                {banks!.map((b) => (
                  <option key={b.id} value={b.id}>
                    {(b.label || b.bankName || "Hesap") +
                      " — " +
                      b.accountHolder +
                      " (…" +
                      b.iban.replace(/\s+/g, "").slice(-4) +
                      ")" +
                      (b.isDefault ? " · varsayılan" : "")}
                  </option>
                ))}
              </Select>
            ) : (
              <Alert variant="warning">
                Kayıtlı banka hesabınız yok. Sipariş onaylamak için{" "}
                <strong>yöneticinizden</strong> “Profilim → Kayıtlı
                Bankalarım”a bir hesap eklemesini isteyin.
              </Alert>
            )}
          </Field>

          {/* Madde 33 — nakit ödemeli siparişte teminat mektubu zorunlu */}
          {cashPayment ? (
            <Field
              error={
                touched && guaranteeMissing
                  ? "Onaylamak için teminat mektubu yükleyin"
                  : undefined
              }
            >
              <Label className="mb-1.5">
                Teminat Mektubu <span className="text-danger-600">*</span>
              </Label>
              <Alert variant="warning" className="mb-3">
                Bu sipariş <strong>nakit ödemeli</strong>. Onaylamadan önce banka
                teminat mektubunuzu yükleyin; alıcı teslimat garantisi olarak
                görür.
              </Alert>
              <AttachmentList
                surface="supplier"
                scope="ORDER_GUARANTEE_LETTER"
                scopeRefId={orderId}
                canDelete
                emptyText="Henüz teminat mektubu yüklenmedi"
              />
              <div className="mt-2">
                <AttachmentUpload
                  surface="supplier"
                  scope="ORDER_GUARANTEE_LETTER"
                  scopeRefId={orderId}
                  hint="Banka teminat mektubu — PDF, görsel, max 50 MB"
                />
              </div>
            </Field>
          ) : null}
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
          <Button
            type="submit"
            loading={loading}
            disabled={loading || !hasBanks || guaranteeMissing}
          >
            <ThumbsUp className="h-4 w-4" />
            Onayla
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
