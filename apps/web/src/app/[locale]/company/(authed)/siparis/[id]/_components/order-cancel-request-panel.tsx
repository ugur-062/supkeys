"use client";

import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@rothern/i18n";
import { formatNumber } from "@/i18n/format";
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
  const t = useTranslations("web.panel.trade.orderCancelRequestPanel");
  const locale = useLocale() as Locale;
  const isSeller = order.role === "seller";
  // F7: karar/geri-çekme butonları tarafın işlem rolünü ister (assertOrderRole
  // aynası) — etiket-only üye paneli salt-okunur görür.
  const { user } = useCompanyAuth();
  const canAct = canActOnOrder(order.role, user);
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
  const strong = (chunks: React.ReactNode) => <strong>{chunks}</strong>;

  const run = async (p: Promise<unknown>, ok: string) => {
    try {
      await p;
      toast.success(ok);
    } catch (err) {
      toast.error(extractErrorMessage(err, t("islemBasarisiz")));
    }
  };

  const doWithdraw = () =>
    run(withdraw.mutateAsync(), t("iptalTalebiGeriCekildi"));
  const doApprove = async () => {
    await run(approve.mutateAsync(undefined), t("iptalOnaylandiSiparisIptalEdildi"));
    setApproveOpen(false);
  };
  const doReject = async () => {
    await run(
      reject.mutateAsync({ note: rejectNote.trim() || undefined }),
      t("iptalTalebiReddedildiSiparisIhtilafli"),
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
              ? t("siparisIhtilafli")
              : t("saticiSiparisIptaliTalepEtti")}
          </h2>
          {reason ? (
            <p className="mt-1 text-sm text-zinc-600">
              <span className="font-medium">{t("saticininGerekcesi")}</span> {reason}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-zinc-500">
            {disputed
              ? t("iptalTalebiReddedildiSiparisIhtilafli2")
              : t("alicininKarariBekleniyorOtomatikOnay")}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {/* SATICI — açık talebi geri çek (yalnız pending). */}
            {canAct && isSeller && pending ? (
              <Button plain onClick={doWithdraw} disabled={withdraw.isPending}>
                {t("iptalTalebiniGeriCek")}
              </Button>
            ) : null}

            {/* ALICI — onayla (→CANCELLED) / reddet (→DISPUTED). DISPUTED'da yalnız onayla. */}
            {canAct && !isSeller ? (
              <>
                <Button
                  onClick={() => setApproveOpen(true)}
                  disabled={approve.isPending}
                >
                  {t("iptaliOnayla")}
                </Button>
                {pending ? (
                  <Button
                    outline
                    onClick={() => setRejectOpen(true)}
                    disabled={reject.isPending}
                  >
                    {t("reddet")}
                  </Button>
                ) : null}
              </>
            ) : null}

            {/* SATICI — DISPUTED'da sevk yönlendirmesi (buton üstteki ana aksiyonda). */}
            {isSeller && disputed ? (
              <p className="text-xs text-zinc-500">
                {t.rich("malBulunduysaYukaridanSiparisiGonder", { strong })}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* Alıcı onay dialogu — CONFIRMED ödeme varsa iade uyarısı (engelleme YOK). */}
      <Dialog open={approveOpen} onClose={() => setApproveOpen(false)}>
        <DialogTitle>{t("iptaliOnayla2")}</DialogTitle>
        <DialogDescription>
          {t("siparisIptalEdilecekBuIslem")}
        </DialogDescription>
        <DialogBody className="space-y-3">
          {confirmedPaid > 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {t.rich("onayliOdemenizVarIadeTaraflarArasinda", {
                strong,
                amount: formatNumber(confirmedPaid, locale),
                currency: curSym,
              })}
            </div>
          ) : null}
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setApproveOpen(false)}>
            {t("vazgec")}
          </Button>
          <Button onClick={doApprove} disabled={approve.isPending}>
            {t("iptaliOnayla")}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Alıcı red dialogu — DISPUTED (gerekçe opsiyonel). */}
      <Dialog open={rejectOpen} onClose={() => setRejectOpen(false)}>
        <DialogTitle>{t("iptalTalebiniReddet")}</DialogTitle>
        <DialogDescription>
          {t("siparisIhtilafliDisputedOlarakIsaretlenecek")}
        </DialogDescription>
        <DialogBody>
          <Field>
            <Label>{t("gerekceOpsiyonel")}</Label>
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
            {t("vazgec")}
          </Button>
          <Button onClick={doReject} disabled={reject.isPending}>
            {t("reddetIhtilafli")}
          </Button>
        </DialogActions>
      </Dialog>
    </section>
  );
}
