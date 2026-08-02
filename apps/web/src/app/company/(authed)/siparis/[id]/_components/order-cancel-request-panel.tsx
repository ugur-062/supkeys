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
import { Textarea } from "@/components/catalyst/textarea";
import {
  useCancelRequestDecision,
  useWithdrawCancelRequest,
  type CompanyOrderDetail,
} from "@/hooks/use-company-orders";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { canActOnOrder } from "@/lib/orders/can-act-on-order";
import { extractErrorMessage } from "@/lib/tenders/error";
import { CURRENCY_SYMBOL } from "@/lib/tenders/labels";
import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * A1 — Satıcı iptal talebi + DISPUTED paneli. Platform sözleşme icra etmez / para
 * tutmaz / hakem değildir; yalnız ne olduğunu kaydeder. Satıcı ACCEPTED siparişte
 * iptal talep eder (buton üst çubukta); burada:
 *  - Açık talep (ACCEPTED + cancelRequestedAt): satıcıya "Geri Çek"; alıcıya
 *    "Onayla" (→CANCELLED) / "Reddet" (→DISPUTED) + CONFIRMED ödeme iade uyarısı.
 *  - DISPUTED: iki-yönlü çıkış — alıcı "İptali Onayla", satıcı yukarıdan sevk.
 */
export function OrderCancelRequestPanel({
  order,
}: {
  order: CompanyOrderDetail;
}) {
  const isSeller = order.role === "seller";
  // F7: karar/geri-çekme butonları tarafın işlem rolünü ister (assertOrderRole
  // aynası) — etiket-only üye paneli salt-okunur görür.
  const { user } = useCompanyAuth();
  const canAct = canActOnOrder(order.role, user?.roles);
  const pending = order.status === "ACCEPTED" && !!order.cancelRequestedAt;
  // A1 (satıcı iptal talebi) DISPUTED'ı — ayıp ihbarı DISPUTED'ını (defectNotifiedAt
  // dolu) DIŞLA; onun kendi paneli (OrderDefectPanel) var.
  const disputed = order.status === "DISPUTED" && !order.defectNotifiedAt;

  const withdraw = useWithdrawCancelRequest(order.id);
  const approve = useCancelRequestDecision(order.id, "approve");
  const reject = useCancelRequestDecision(order.id, "reject");

  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState("");

  if (!pending && !disputed) return null;

  const curSym =
    (CURRENCY_SYMBOL as Record<string, string>)[order.currency] ??
    order.currency;
  const confirmedPaid = Number(order.paymentTotals?.confirmed ?? 0);
  const reason = order.cancelRequestReason;

  const run = async (p: Promise<unknown>, ok: string) => {
    try {
      await p;
      toast.success(ok);
    } catch (err) {
      toast.error(extractErrorMessage(err, "İşlem başarısız"));
    }
  };

  const doWithdraw = () =>
    run(withdraw.mutateAsync(), "İptal talebi geri çekildi");
  const doApprove = async () => {
    await run(approve.mutateAsync(undefined), "İptal onaylandı — sipariş iptal edildi");
    setApproveOpen(false);
  };
  const doReject = async () => {
    await run(
      reject.mutateAsync({ note: rejectNote.trim() || undefined }),
      "İptal talebi reddedildi — sipariş ihtilaflı",
    );
    setRejectOpen(false);
  };

  return (
    <section
      className={`rounded-2xl border p-4 ${
        disputed
          ? "border-amber-300 bg-amber-50"
          : "border-zinc-200 bg-zinc-50"
      }`}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle
          className={`mt-0.5 size-5 shrink-0 ${disputed ? "text-amber-600" : "text-zinc-500"}`}
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-zinc-900">
            {disputed
              ? "Sipariş ihtilaflı"
              : "Satıcı sipariş iptali talep etti"}
          </h2>
          {reason ? (
            <p className="mt-1 text-sm text-zinc-600">
              <span className="font-medium">Satıcının gerekçesi:</span> {reason}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-zinc-500">
            {disputed
              ? "İptal talebi reddedildi; sipariş ihtilaflı. Satıcı mal bulunca sevk edebilir, ya da alıcı iptali onaylayabilir. Sözleşme tarafların sorumluluğundadır — platform hakem değildir."
              : "Alıcının kararı bekleniyor. Otomatik onay yoktur."}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {/* SATICI — açık talebi geri çek (yalnız pending). */}
            {canAct && isSeller && pending ? (
              <Button plain onClick={doWithdraw} disabled={withdraw.isPending}>
                İptal Talebini Geri Çek
              </Button>
            ) : null}

            {/* ALICI — onayla (→CANCELLED) / reddet (→DISPUTED). DISPUTED'da yalnız onayla. */}
            {canAct && !isSeller ? (
              <>
                <Button
                  onClick={() => setApproveOpen(true)}
                  disabled={approve.isPending}
                >
                  İptali Onayla
                </Button>
                {pending ? (
                  <Button
                    outline
                    onClick={() => setRejectOpen(true)}
                    disabled={reject.isPending}
                  >
                    Reddet
                  </Button>
                ) : null}
              </>
            ) : null}

            {/* SATICI — DISPUTED'da sevk yönlendirmesi (buton üstteki ana aksiyonda). */}
            {isSeller && disputed ? (
              <p className="text-xs text-zinc-500">
                Mal bulunduysa yukarıdan <strong>Siparişi Gönder</strong> ile
                ihtilafı çözebilirsiniz.
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* Alıcı onay dialogu — CONFIRMED ödeme varsa iade uyarısı (engelleme YOK). */}
      <Dialog open={approveOpen} onClose={() => setApproveOpen(false)}>
        <DialogTitle>İptali onayla</DialogTitle>
        <DialogDescription>
          Sipariş iptal edilecek. Bu işlem geri alınamaz.
        </DialogDescription>
        <DialogBody className="space-y-3">
          {confirmedPaid > 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Onaylı ödemeniz var ({confirmedPaid.toLocaleString("tr-TR")}{" "}
              {curSym}). İade taraflar arasında halledilir —{" "}
              <strong>platform para tutmaz</strong>. Ödemeniz iade edildikten
              sonra onaylamanız önerilir.
            </div>
          ) : null}
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setApproveOpen(false)}>
            Vazgeç
          </Button>
          <Button onClick={doApprove} disabled={approve.isPending}>
            İptali Onayla
          </Button>
        </DialogActions>
      </Dialog>

      {/* Alıcı red dialogu — DISPUTED (gerekçe opsiyonel). */}
      <Dialog open={rejectOpen} onClose={() => setRejectOpen(false)}>
        <DialogTitle>İptal talebini reddet</DialogTitle>
        <DialogDescription>
          Sipariş ihtilaflı (DISPUTED) olarak işaretlenecek — onaylanmış duruma
          geri dönmez. Satıcı mal bulunca sevk edebilir.
        </DialogDescription>
        <DialogBody>
          <Field>
            <Label>Gerekçe (opsiyonel)</Label>
            <Textarea
              rows={2}
              maxLength={500}
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
            />
          </Field>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setRejectOpen(false)}>
            Vazgeç
          </Button>
          <Button onClick={doReject} disabled={reject.isPending}>
            Reddet (İhtilaflı)
          </Button>
        </DialogActions>
      </Dialog>
    </section>
  );
}
