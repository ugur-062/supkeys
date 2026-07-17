"use client";

import {
  usePaymentDecision,
  useRecordPayment,
  type CompanyOrderDetail,
  type OrderPayment,
} from "@/hooks/use-company-orders";
import { ReasonDialog } from "@/components/tenders/reason-dialog";
import { extractErrorMessage } from "@/lib/tenders/error";
import { moneyInputError } from "@/lib/money-input";
import {
  CURRENCY_SYMBOL,
  formatPaymentPlan,
  KDV_HARIC_NOTE,
} from "@/lib/tenders/labels";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { Check, Plus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const PAYMENT_STATUS: Record<
  OrderPayment["status"],
  { label: string; cls: string }
> = {
  AWAITING_CONFIRMATION: {
    label: "Onay bekliyor",
    cls: "bg-warning-50 text-warning-600 border border-warning-500/30",
  },
  CONFIRMED: {
    label: "Onaylandı",
    cls: "bg-success-50 text-success-600 border border-success-500/30",
  },
  REJECTED: {
    label: "Reddedildi",
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
  const curSym =
    CURRENCY_SYMBOL[(order.currency as keyof typeof CURRENCY_SYMBOL) ?? "TRY"] ??
    "₺";
  const isBuyer = order.role === "buyer";
  const isSeller = order.role === "seller";
  const isLc = order.paymentCategory === "LETTER_OF_CREDIT";
  const record = useRecordPayment(order.id);
  const decide = usePaymentDecision(order.id);

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
    const value = Number(amount.replace(",", "."));
    // F4: min 0.01 + 2 ondalık + MAX_MONEY (backend order-payment.dto birebir).
    const e = moneyInputError(value);
    if (e) {
      toast.error(e);
      return;
    }
    try {
      await record.mutateAsync({
        amount: value,
        note: note.trim() || undefined,
      });
      toast.success("Ödeme bildirildi — satıcının onayı bekleniyor");
      resetForm();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Ödeme bildirilemedi"));
    }
  };

  // Reddedilecek ödeme kaydının id'si — set edilince ReasonDialog açılır
  // (native window.prompt yerine uygulama diyaloğu).
  const [rejectId, setRejectId] = useState<string | null>(null);

  const runDecision = async (
    paymentId: string,
    decision: "confirm" | "reject",
    reason?: string,
  ) => {
    try {
      await decide.mutateAsync({ paymentId, decision, reason });
      toast.success(decision === "confirm" ? "Ödeme onaylandı" : "Ödeme reddedildi");
      setRejectId(null);
    } catch (err) {
      toast.error(extractErrorMessage(err, "İşlem başarısız"));
    }
  };

  return (
    <section className="rounded-xl border border-zinc-950/10 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-950/5 px-5 py-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-zinc-900">Ödeme</h3>
          {/* İhale şartındaki ödeme planı — award anındaki snapshot. */}
          <p className="truncate text-xs text-zinc-500">
            {formatPaymentPlan(order)}
            {order.paymentNote ? ` · ${order.paymentNote}` : ""}
          </p>
          <p className="mt-0.5 text-xs text-zinc-400">{KDV_HARIC_NOTE}</p>
        </div>
        {isBuyer && order.paymentOpen ? (
          <button
            type="button"
            onClick={() => (open ? resetForm() : openForm())}
            className="inline-flex items-center gap-1 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800"
          >
            <Plus className="h-3.5 w-3.5" />
            Ödemeyi Yaptım
          </button>
        ) : null}
      </div>

      {/* Toplamlar */}
      <div className="grid grid-cols-3 divide-x divide-zinc-950/5 border-b border-zinc-950/5">
        <Totals label="Onaylanan" value={t.confirmed} tone="text-success-600" curSym={curSym} />
        <Totals label="Bekleyen" value={t.pending} tone="text-warning-600" curSym={curSym} />
        <Totals label="Kalan" value={t.remaining} tone="text-zinc-900" curSym={curSym} />
      </div>

      {/* Vade tarihi (Vadeli/Çek/kısmi-peşin kalanı) — teslim sonrası hesaplanır. */}
      {order.paymentDueDate ? (
        <div className="border-b border-zinc-950/5 px-5 py-2 text-xs text-zinc-600">
          Ödeme vadesi:{" "}
          <strong>
            {format(new Date(order.paymentDueDate), "dd MMM yyyy", { locale: tr })}
          </strong>
        </div>
      ) : null}

      {/* Akreditif — manuel ödeme akışı kapalı bilgilendirmesi. */}
      {isLc ? (
        <div className="border-b border-zinc-950/5 bg-zinc-50 px-5 py-2 text-xs text-zinc-600">
          Ödeme akreditif kapsamında <strong>banka kanalından</strong> yapılır —
          satıcı ödemeyi aldığında Akreditif bölümünden işaretler.
        </div>
      ) : null}

      {/* Kayıt formu (alıcı) */}
      {open && isBuyer ? (
        <div className="space-y-3 border-b border-zinc-950/5 bg-zinc-50 px-5 py-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-600">
              Tutar ({curSym})
            </span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0,00"
              className="w-full rounded-lg border border-surface-border bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-600">
              Not (opsiyonel)
            </span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Dekont no, açıklama…"
              className="w-full rounded-lg border border-surface-border bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100"
            >
              Vazgeç
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={record.isPending}
              className="rounded-lg bg-zinc-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              Bildir
            </button>
          </div>
        </div>
      ) : null}

      {/* Ödeme listesi */}
      <div className="divide-y divide-zinc-950/5">
        {order.payments.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-zinc-500">
            {order.paymentOpen
              ? "Henüz ödeme kaydı yok."
              : order.paymentTiming === "AFTER_DELIVERY"
                ? "Ödeme bölümü, sipariş teslim alındıktan sonra açılır."
                : "Ödeme kaydı, satıcı siparişi onayladıktan sonra eklenebilir."}
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
                  <div className="font-mono text-sm font-semibold text-zinc-900">
                    {fmt(p.amount)} {curSym}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {p.method ? `${p.method} · ` : ""}
                    {format(new Date(p.createdAt), "dd MMM yyyy", { locale: tr })}
                    {p.note ? ` · ${p.note}` : ""}
                    {p.status === "REJECTED" && p.rejectReason
                      ? ` · ${p.rejectReason}`
                      : ""}
                  </div>
                  {p.chequeNo ? (
                    <div className="mt-0.5 text-xs text-amber-700">
                      Çek No: {p.chequeNo}
                      {p.chequeBank ? ` · ${p.chequeBank}` : ""}
                      {p.chequeDueDate
                        ? ` · Vade: ${format(new Date(p.chequeDueDate), "dd MMM yyyy", { locale: tr })}`
                        : ""}
                    </div>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${st.cls}`}
                  >
                    {st.label}
                  </span>
                  {isSeller && p.status === "AWAITING_CONFIRMATION" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => runDecision(p.id, "confirm")}
                        disabled={decide.isPending}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-success-50 text-success-600 hover:bg-success-500/10 disabled:opacity-50"
                        title="Ödemeyi Aldım"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setRejectId(p.id)}
                        disabled={decide.isPending}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-danger-50 text-danger-600 hover:bg-danger-500/10 disabled:opacity-50"
                        title="Reddet"
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
        title="Ödemeyi Reddet"
        description="Red gerekçesi alıcıya iletilir."
        confirmLabel="Reddet"
        minLength={1}
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
      <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
        {label}
      </div>
      <div className={`mt-0.5 font-mono text-sm font-semibold ${tone}`}>
        {fmt(value)} {curSym}
      </div>
    </div>
  );
}
