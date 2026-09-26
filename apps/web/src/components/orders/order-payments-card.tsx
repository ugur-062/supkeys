"use client";

import { useTranslations } from "next-intl";
import { formatDate } from "@/lib/format-date";
import {
  usePaymentDecision,
  useRecordPayment,
  type CompanyOrderDetail,
  type OrderPayment,
} from "@/hooks/use-company-orders";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Button } from "@/components/catalyst/button";
import { Field, Label } from "@/components/catalyst/fieldset";
import { Input } from "@/components/catalyst/input";
import { MoneyInput } from "@/components/ui/money-input";
import { ReasonDialog } from "@/components/tenders/reason-dialog";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { canActOnOrder } from "@/lib/orders/can-act-on-order";
import { extractErrorMessage } from "@/lib/tenders/error";
import { CURRENCY_SYMBOL } from "@/lib/tenders/labels";
import { useFormatPaymentPlan, useMoneyInputError } from "@/i18n/domain";
import { Check, Plus, X } from "lucide-react";
import { useState } from "react";
import { useConfirm } from "@/components/providers/confirm-dialog";
import { accentFillClass, useButtonAccent } from "@/components/ui/button-accent";
import { toast } from "sonner";

// Etiket katalog anahtarı (`status.<KOD>`) — çizim yerinde `tr(key)`.
const PAYMENT_STATUS: Record<
  OrderPayment["status"],
  { key: string; cls: string }
> = {
  AWAITING_CONFIRMATION: {
    key: "status.AWAITING_CONFIRMATION",
    cls: "bg-warning-50 text-warning-600 border border-warning-500/30",
  },
  CONFIRMED: {
    key: "status.CONFIRMED",
    cls: "bg-success-50 text-success-600 border border-success-500/30",
  },
  REJECTED: {
    key: "status.REJECTED",
    cls: "bg-danger-50 text-danger-600 border border-danger-500/30",
  },
};

function fmt(n: string | number) {
  return Number(n).toLocaleString("tr-TR", { minimumFractionDigits: 2 });
}

/**
 * Sipariş ödeme kartı — alıcı "Ödemeyi Yaptım" der, satıcı "Ödemeyi Aldım"
 * ile onaylar (veya reddeder); kısmi ödeme + onaylı/bekleyen/kalan toplamları.
 * Ödeme YÖNTEMİ sorulmaz — ihale şartında kararlaştırılır (plan üstte). Akreditifte
 * alıcının manuel ödeme akışı kapalıdır (paymentOpen=false) — ödeme banka
 * kanalından, satıcı "Ödeme Bankadan Alındı" adımıyla işaretler.
 */
export function OrderPaymentsCard({ order }: { order: CompanyOrderDetail }) {
  const tr = useTranslations("web.panel.trade.orderPaymentsCard");
  const moneyError = useMoneyInputError();
  const td = useTranslations("web.domain");
  const formatPlan = useFormatPaymentPlan();
  // Birincil düğme rengi portaldan (satınalmada siyah yok — 2026-09-17 kuralı).
  const accent = useButtonAccent();
  const curSym =
    CURRENCY_SYMBOL[(order.currency as keyof typeof CURRENCY_SYMBOL) ?? "TRY"] ??
    "₺";
  const isBuyer = order.role === "buyer";
  const isSeller = order.role === "seller";
  // F7: ödeme kaydet/onayla tarafın işlem rolünü ister (assertOrderRole aynası).
  const { user } = useCompanyAuth();
  const canAct = canActOnOrder(order.role, user);
  const isLc = order.paymentCategory === "LETTER_OF_CREDIT";
  const record = useRecordPayment(order.id);
  const decide = usePaymentDecision(order.id);
  const confirm = useConfirm();

  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const t = order.paymentTotals;

  // S4 — adım tutarını önceden doldur: peşin adımındaysak (peşin eşiği henüz
  // dolmadıysa) eşiğin kalanı, aksi halde sipariş kalanı. Alan DÜZENLENEBİLİR
  // kalır (iki havaleyle ödeyen takılmaz; backend tavan korumasını zaten yapar).
  const advanceDue = Number(order.advanceDue ?? 0);
  const advanceRemaining = Math.max(
    0,
    advanceDue - Number(t.confirmed) - Number(t.pending),
  );
  const suggested =
    advanceRemaining > 0.01 ? advanceRemaining : Number(t.remaining);
  // Madde 16: tamamı bildirildiyse (kalan 0 — bekleyenler dahil düşülür)
  // "Ödemeyi Yaptım" PASİF: fazla/yinelenen bildirim daha butonda engellenir
  // (backend tavanı zaten reddediyordu, kullanıcı hatayı formda görüyordu).
  const fullyCovered = Number(t.remaining) <= 0;

  const openForm = () => {
    setAmount(suggested > 0 ? suggested.toFixed(2) : "");
    setNote("");
    setOpen(true);
  };

  const resetForm = () => {
    setOpen(false);
    setAmount("");
    setNote("");
  };

  const submit = async () => {
    const value = Number(amount);
    // F4: min 0.01 + 2 ondalık + MAX_MONEY (backend order-payment.dto birebir).
    const e = moneyError(value);
    if (e) {
      toast.error(e);
      return;
    }
    // §10.3: tavan istemcide de söylenir (backend zaten reddediyor) —
    // bekleyenler dahil kalanın üstünde bildirim daha formda durdurulur.
    if (value > Number(t.remaining) + 0.005) {
      toast.error(
        tr("kalanBorcunUstundeBildirimYapilamaz", { toLocaleString: Number(t.remaining).toLocaleString("tr-TR", { minimumFractionDigits: 2 }), curSym: curSym }),
      );
      return;
    }
    try {
      await record.mutateAsync({
        amount: value,
        note: note.trim() || undefined,
      });
      toast.success(tr("odemeBildirildiSaticininOnayiBekleniyor"));
      resetForm();
    } catch (err) {
      toast.error(extractErrorMessage(err, tr("odemeBildirilemedi")));
    }
  };

  // Reddedilecek ödeme kaydının id'si — set edilince ReasonDialog açılır
  // (native window.prompt yerine uygulama diyaloğu).
  const [rejectId, setRejectId] = useState<string | null>(null);

  /** Tutarı erişilebilir ad ve onay metni için biçimler. */
  const amountLabel = (amount: number | string) =>
    `${Number(amount).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ${curSym}`;

  /**
   * #5: "Ödemeyi Aldım" GERİ ALINAMAZ (backend `paymentDecision` atomik CAS
   * ile CONFIRMED yazar, AWAITING'e dönüş yolu yok) → tutarı gösteren onay.
   */
  const confirmReceipt = async (p: { id: string; amount: number | string }) => {
    const ok = await confirm({
      title: tr("odemeyiAldim"),
      description: tr("tutarindakiOdemeyiTahsilEttiginiziOnayliyor", { amountLabel: amountLabel(p.amount) }),
      confirmLabel: tr("evetTahsilEttim"),
      destructive: true,
    });
    if (!ok) return;
    await runDecision(p.id, "confirm");
  };

  const runDecision = async (
    paymentId: string,
    decision: "confirm" | "reject",
    reason?: string,
  ) => {
    try {
      await decide.mutateAsync({ paymentId, decision, reason });
      toast.success(decision === "confirm" ? tr("odemeOnaylandi") : tr("odemeReddedildi"));
      setRejectId(null);
    } catch (err) {
      toast.error(extractErrorMessage(err, tr("islemBasarisiz")));
    }
  };

  return (
    <section className="rounded-xl border border-zinc-950/10 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-950/5 px-5 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-zinc-900">{tr("odeme")}</h2>
          {/* İhale şartındaki ödeme planı — award anındaki snapshot. */}
          <p className="truncate text-xs text-zinc-500">
            {formatPlan(order)}
            {order.paymentNote ? ` · ${order.paymentNote}` : ""}
          </p>
          <p className="mt-0.5 text-xs text-zinc-400">{td("kdvHaricNote")}</p>
        </div>
        {canAct && isBuyer && order.paymentOpen ? (
          <button
            type="button"
            onClick={openForm}
            disabled={fullyCovered}
            title={
              fullyCovered
                ? tr("tamamiBildirildiOnayBekleyenlerDahil")
                : undefined
            }
            className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-300 ${accentFillClass(accent)}`}
          >
            <Plus className="h-3.5 w-3.5" />
            {tr("odemeyiYaptim")}
          </button>
        ) : null}
      </div>

      {/* Toplamlar */}
      <div className="grid grid-cols-3 divide-x divide-zinc-950/5 border-b border-zinc-950/5">
        <Totals label={tr("onaylanan")} value={t.confirmed} tone="text-success-600" curSym={curSym} />
        <Totals label={tr("bekleyen")} value={t.pending} tone="text-warning-600" curSym={curSym} />
        <Totals label={tr("kalan")} value={t.remaining} tone="text-zinc-900" curSym={curSym} />
      </div>

      {/* Vade tarihi (Vadeli/Çek/kısmi-peşin kalanı) — teslim sonrası hesaplanır.
          P0: vadesi GEÇMİŞ + borç açık → danger vurgusu ve gecikme gün sayısı. */}
      {order.paymentDueDate ? (
        (() => {
          const overdueDays = Math.floor(
            (Date.now() - new Date(order.paymentDueDate).getTime()) / 86_400_000,
          );
          const overdue = overdueDays > 0 && Number(t.remaining) > 0;
          return (
            <div
              className={
                overdue
                  ? "border-b border-red-100 bg-red-50 px-5 py-2 text-xs font-medium text-red-700"
                  : "border-b border-zinc-950/5 px-5 py-2 text-xs text-zinc-600"
              }
            >
              {tr.rich("odemeVadesi", {
                date: formatDate(order.paymentDueDate, "short"),
                strong: (c) => <strong>{c}</strong>,
              })}
              {overdue ? ` ${tr("gunGecikti", { overdueDays: overdueDays })}` : ""}
            </div>
          );
        })()
      ) : null}

      {/* Akreditif — manuel ödeme akışı kapalı bilgilendirmesi. */}
      {isLc ? (
        <div className="border-b border-zinc-950/5 bg-zinc-50 px-5 py-2 text-xs text-zinc-600">
          {tr.rich("odemeAkreditifKapsaminda", { strong: (c) => <strong>{c}</strong> })}
        </div>
      ) : null}

      {/* Kayıt formu — POP-UP (madde 16: inline şerit yerine diyalog). */}
      <Dialog open={open && isBuyer} onClose={resetForm} size="md">
        <DialogTitle>{tr("odemeyiBildir")}</DialogTitle>
        <DialogDescription>
          {tr("yaptiginizOdemeninTutariniGirinSatici")}
        </DialogDescription>
        {/* P1 (denetim §4.2): form + Enter ile gönderim. */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
        <DialogBody className="space-y-4">
          <Field>
            <Label>{tr("tutar", { curSym: curSym })}</Label>
            <div className="flex items-center gap-2">
              <MoneyInput
                value={amount}
                onChange={setAmount}
                placeholder="0,00"
                aria-label={tr("odemeTutari")}
              />
              {/* §10.3: tek tık tam kapama. */}
              <button
                type="button"
                onClick={() => setAmount(Number(t.remaining).toFixed(2))}
                className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-zinc-600 ring-1 ring-zinc-950/10 transition hover:bg-zinc-50"
              >
                {tr("tumunuOde")}
              </button>
            </div>
          </Field>
          <Field>
            <Label>{tr("notOpsiyonel")}</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={tr("dekontNoAciklama")}
            />
          </Field>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={resetForm}>
            {tr("vazgec")}
          </Button>
          <Button type="submit" disabled={record.isPending || !amount}>
            {tr("bildir")}
          </Button>
        </DialogActions>
        </form>
      </Dialog>

      {/* Ödeme listesi */}
      <div className="divide-y divide-zinc-950/5">
        {order.payments.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-zinc-500">
            {order.paymentOpen
              ? tr("henuzOdemeKaydiYok")
              : order.paymentTiming === "AFTER_DELIVERY"
                ? tr("odemeBolumuSiparisTeslimAlindiktan")
                : tr("odemeKaydiSaticiSiparisiOnayladiktan")}
          </p>
        ) : (
          order.payments.map((p) => {
            const st = PAYMENT_STATUS[p.status];
            return (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 px-5 py-3"
              >
                <div className="min-w-0">
                  <div className="tabular-nums text-sm font-semibold text-zinc-900">
                    {fmt(p.amount)} {curSym}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {p.method ? `${p.method} · ` : ""}
                    {formatDate(p.createdAt, "short")}
                    {p.note ? ` · ${p.note}` : ""}
                    {p.status === "REJECTED" && p.rejectReason
                      ? ` · ${p.rejectReason}`
                      : ""}
                  </div>
                  {p.chequeNo ? (
                    <div className="mt-0.5 text-xs text-amber-700">
                      {tr("cekNo", { chequeNo: p.chequeNo })}
                      {p.chequeBank ? ` · ${p.chequeBank}` : ""}
                      {p.chequeDueDate
                        ? ` ${tr("vade", { formatDate: formatDate(p.chequeDueDate, "short") })}`
                        : ""}
                    </div>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}
                  >
                    {tr(st.key as never)}
                  </span>
                  {canAct && isSeller && p.status === "AWAITING_CONFIRMATION" ? (
                    <>
                      {/* #5 (denetim 2026-08-26 Parça 10): bu aksiyon tek
                          tıkla, onaysız ve GERİ ALINAMAZ idi (backend CAS ile
                          CONFIRMED yazıyor, dönüş yolu yok) — üstelik 28px ve
                          adsızdı. Kardeşi "Reddet" zaten diyalogdan geçiyordu. */}
                      <button
                        type="button"
                        onClick={() => void confirmReceipt(p)}
                        disabled={decide.isPending}
                        className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-success-50 text-success-600 hover:bg-success-500/10 disabled:opacity-50"
                        aria-label={tr("tutarindakiOdemeyiAldimOlarakIsaretle", { amountLabel: amountLabel(p.amount) })}
                        title={tr("odemeyiAldim2")}
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setRejectId(p.id)}
                        disabled={decide.isPending}
                        className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-danger-50 text-danger-600 hover:bg-danger-500/10 disabled:opacity-50"
                        aria-label={tr("tutarindakiOdemeyiReddet", { amountLabel: amountLabel(p.amount) })}
                        title={tr("reddet")}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Ödeme reddi gerekçe diyaloğu (native window.prompt yerine). */}
      <ReasonDialog
        open={rejectId !== null}
        onClose={() => setRejectId(null)}
        onSubmit={(reason) => rejectId && runDecision(rejectId, "reject", reason)}
        title={tr("odemeyiReddet")}
        description={tr("redGerekcesiAliciyaIletilir")}
        confirmLabel={tr("reddet")}
        minLength={10}
        pending={decide.isPending}
        destructive
      />
    </section>
  );
}

function Totals({
  label,
  value,
  tone,
  curSym,
}: {
  label: string;
  value: string;
  tone: string;
  curSym: string;
}) {
  return (
    <div className="px-4 py-3 text-center">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">
        {label}
      </div>
      <div className={`mt-0.5 tabular-nums text-sm font-semibold ${tone}`}>
        {fmt(value)} {curSym}
      </div>
    </div>
  );
}
