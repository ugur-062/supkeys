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
import {
  useProposeRevision,
  useRevisionDecision,
  type CompanyOrderDetail,
  type OrderRevisionRow,
} from "@/hooks/use-company-orders";
import { extractErrorMessage } from "@/lib/tenders/error";
import { CURRENCY_SYMBOL } from "@/lib/tenders/labels";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { GitPullRequestArrow, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const REV_STATUS: Record<
  OrderRevisionRow["status"],
  { label: string; cls: string }
> = {
  PENDING: { label: "Onay bekliyor", cls: "bg-amber-50 text-amber-700" },
  APPROVED: { label: "Onaylandı", cls: "bg-emerald-50 text-emerald-700" },
  REJECTED: { label: "Reddedildi", cls: "bg-red-50 text-red-700" },
  CANCELLED: { label: "Geri çekildi", cls: "bg-zinc-100 text-zinc-500" },
};

type DraftItem = {
  name: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  deliveryDate: string;
  note: string;
};

function fmtDate(v: string | null) {
  if (!v) return "—";
  try {
    return format(new Date(v), "dd MMM yyyy", { locale: tr });
  } catch {
    return v;
  }
}

/**
 * Sipariş revizyon müzakere paneli (Faz 5). Satıcı ACCEPTED siparişte revizyon
 * önerir (yeni kalemler + opsiyonel teslim tarihi/not); alıcı onaylar/reddeder,
 * satıcı geri çekebilir. Onaylanınca sipariş kalemleri + tutarı güncellenir.
 */
export function OrderRevisionPanel({ order }: { order: CompanyOrderDetail }) {
  const id = order.id;
  const isSeller = order.role === "seller";
  const curSym =
    CURRENCY_SYMBOL[(order.currency as keyof typeof CURRENCY_SYMBOL) ?? "TRY"] ??
    "₺";

  const propose = useProposeRevision(id);
  const approve = useRevisionDecision(id, "approve");
  const reject = useRevisionDecision(id, "reject");
  const cancel = useRevisionDecision(id, "cancel");

  const pending = order.revisions.find((r) => r.status === "PENDING") ?? null;
  const history = order.revisions.filter((r) => r.status !== "PENDING");

  // Satıcı revizyon önerebilir mi? ACCEPTED + ödeme kaydı yok + LC açılmamış +
  // açık revizyon yok (backend de zorlar; UI önden kapatır).
  const noPayments =
    Number(order.paymentTotals?.confirmed ?? 0) === 0 &&
    Number(order.paymentTotals?.pending ?? 0) === 0;
  const lcBlocked =
    order.paymentCategory === "LETTER_OF_CREDIT" && !!order.lcOpenedAt;
  const canPropose =
    isSeller &&
    order.status === "ACCEPTED" &&
    !pending &&
    noPayments &&
    !lcBlocked;

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [expDate, setExpDate] = useState("");
  const [note, setNote] = useState("");
  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const openForm = () => {
    // Mevcut sipariş kalemlerinden ön-doldur — satıcı üzerinde değiştirir.
    setItems(
      order.items.map((it) => ({
        name: it.name,
        quantity: it.quantity,
        unit: it.unit,
        unitPrice: it.unitPrice,
        deliveryDate: it.deliveryDate ? it.deliveryDate.slice(0, 10) : "",
        note: it.note ?? "",
      })),
    );
    setExpDate(order.expectedDeliveryDate?.slice(0, 10) ?? "");
    setNote("");
    setOpen(true);
  };

  const setItem = (i: number, patch: Partial<DraftItem>) =>
    setItems((prev) => prev.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const addItem = () =>
    setItems((prev) => [
      ...prev,
      {
        name: "",
        quantity: "1",
        unit: "adet",
        unitPrice: "0",
        deliveryDate: "",
        note: "",
      },
    ]);
  const removeItem = (i: number) =>
    setItems((prev) => prev.filter((_, j) => j !== i));

  const draftTotal = items.reduce(
    (s, it) => s + Number(it.quantity || 0) * Number(it.unitPrice || 0),
    0,
  );

  const submit = async () => {
    const parsed = items.map((it) => ({
      name: it.name.trim(),
      quantity: Number(String(it.quantity).replace(",", ".")),
      unit: it.unit.trim(),
      unitPrice: Number(String(it.unitPrice).replace(",", ".")),
      deliveryDate: it.deliveryDate || undefined,
      note: it.note.trim() || undefined,
    }));
    if (parsed.length === 0) {
      toast.error("En az 1 kalem gerekli");
      return;
    }
    for (const it of parsed) {
      if (!it.name || !it.unit) {
        toast.error("Kalem adı ve birim zorunlu");
        return;
      }
      if (!(it.quantity > 0)) {
        toast.error(`"${it.name || "Kalem"}" için miktar 0'dan büyük olmalı`);
        return;
      }
      if (!(it.unitPrice >= 0)) {
        toast.error(`"${it.name}" için geçerli birim fiyat girin`);
        return;
      }
    }
    try {
      await propose.mutateAsync({
        items: parsed,
        expectedDeliveryDate: expDate || undefined,
        note: note.trim() || undefined,
      });
      toast.success("Revizyon önerildi — alıcının onayı bekleniyor");
      setOpen(false);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Revizyon önerilemedi"));
    }
  };

  const doApprove = async (revisionId: string) => {
    try {
      await approve.mutateAsync({ revisionId });
      toast.success("Revizyon onaylandı — sipariş güncellendi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "İşlem başarısız"));
    }
  };
  const doReject = async () => {
    if (!rejectFor) return;
    try {
      await reject.mutateAsync({ revisionId: rejectFor, reason: rejectReason });
      toast.success("Revizyon reddedildi");
      setRejectFor(null);
      setRejectReason("");
    } catch (err) {
      toast.error(extractErrorMessage(err, "İşlem başarısız"));
    }
  };
  const doCancel = async (revisionId: string) => {
    try {
      await cancel.mutateAsync({ revisionId });
      toast.success("Revizyon geri çekildi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "İşlem başarısız"));
    }
  };

  // Panel yalnız ilgili bir şey varsa görünür: öneri butonu, açık revizyon ya
  // da geçmiş. (Aksi halde sipariş detayını kalabalıklaştırmaz.)
  if (!canPropose && !pending && history.length === 0) return null;

  const RevItems = ({ rev }: { rev: OrderRevisionRow }) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-zinc-500">
            <th className="py-1 pr-3 font-medium">Kalem</th>
            <th className="py-1 pr-3 text-right font-medium">Miktar</th>
            <th className="py-1 pr-3 text-right font-medium">Teslim</th>
            <th className="py-1 pr-3 text-right font-medium">Birim Fiyat</th>
            <th className="py-1 text-right font-medium">Tutar</th>
          </tr>
        </thead>
        <tbody>
          {rev.items.map((it) => (
            <tr key={it.id} className="border-t border-zinc-100">
              <td className="py-1 pr-3">{it.name}</td>
              <td className="py-1 pr-3 text-right text-zinc-600">
                {Number(it.quantity).toLocaleString("tr-TR")} {it.unit}
              </td>
              <td className="py-1 pr-3 text-right text-zinc-600">
                {fmtDate(it.deliveryDate ?? null)}
              </td>
              <td className="py-1 pr-3 text-right font-mono text-zinc-600">
                {Number(it.unitPrice).toLocaleString("tr-TR")} {curSym}
              </td>
              <td className="py-1 text-right font-mono font-semibold">
                {(Number(it.unitPrice) * Number(it.quantity)).toLocaleString(
                  "tr-TR",
                )}{" "}
                {curSym}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <section className="rounded-2xl border border-zinc-950/10 bg-white p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <GitPullRequestArrow className="h-4 w-4 text-zinc-700" />
          <h3 className="text-sm font-semibold text-zinc-900">
            Sipariş Revizyonu
          </h3>
        </div>
        {canPropose ? (
          <Button onClick={openForm} disabled={propose.isPending}>
            Revizyon Öner
          </Button>
        ) : null}
      </div>

      {/* Açık (onay bekleyen) revizyon */}
      {pending ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-zinc-900">
              Önerilen revizyon
            </span>
            <span
              className={`rounded px-2 py-0.5 text-[11px] font-semibold ${REV_STATUS[pending.status].cls}`}
            >
              {REV_STATUS[pending.status].label}
            </span>
          </div>
          {pending.note ? (
            <p className="mb-2 text-sm text-zinc-600">{pending.note}</p>
          ) : null}
          <RevItems rev={pending} />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-amber-200 pt-2 text-sm">
            <span className="text-zinc-600">
              Yeni teslim:{" "}
              <strong>{fmtDate(pending.expectedDeliveryDate)}</strong>
            </span>
            <span className="font-mono font-semibold text-zinc-900">
              Yeni tutar: {Number(pending.amount).toLocaleString("tr-TR")}{" "}
              {curSym}
            </span>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            {isSeller ? (
              <Button
                plain
                onClick={() => doCancel(pending.id)}
                disabled={cancel.isPending}
              >
                Geri Çek
              </Button>
            ) : (
              <>
                <Button
                  plain
                  onClick={() => setRejectFor(pending.id)}
                  disabled={reject.isPending}
                >
                  Reddet
                </Button>
                <Button
                  onClick={() => doApprove(pending.id)}
                  disabled={approve.isPending}
                >
                  Onayla
                </Button>
              </>
            )}
          </div>
        </div>
      ) : null}

      {/* Geçmiş revizyonlar */}
      {history.length > 0 ? (
        <div className="mt-3 space-y-2">
          {history.map((r) => (
            <details
              key={r.id}
              className="rounded-lg border border-zinc-200 p-3 text-sm"
            >
              <summary className="flex cursor-pointer items-center justify-between gap-2">
                <span className="text-zinc-700">
                  {fmtDate(r.createdAt)} · {Number(r.amount).toLocaleString("tr-TR")}{" "}
                  {curSym}
                </span>
                <span
                  className={`rounded px-2 py-0.5 text-[11px] font-semibold ${REV_STATUS[r.status].cls}`}
                >
                  {REV_STATUS[r.status].label}
                </span>
              </summary>
              <div className="mt-2">
                {r.note ? (
                  <p className="mb-2 text-zinc-600">{r.note}</p>
                ) : null}
                {r.rejectReason ? (
                  <p className="mb-2 text-red-600">Ret gerekçesi: {r.rejectReason}</p>
                ) : null}
                <RevItems rev={r} />
              </div>
            </details>
          ))}
        </div>
      ) : null}

      {/* Revizyon öner modalı (satıcı) */}
      <Dialog open={open} onClose={() => setOpen(false)} size="3xl">
        <DialogTitle>Revizyon Öner</DialogTitle>
        <DialogDescription>
          Kalemleri düzenleyin; tutar otomatik hesaplanır. Alıcı onaylayınca
          sipariş güncellenir.
        </DialogDescription>
        <DialogBody className="space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-zinc-500">
                  <th className="pb-1 pr-2 font-medium">Kalem</th>
                  <th className="pb-1 pr-2 font-medium">Miktar</th>
                  <th className="pb-1 pr-2 font-medium">Birim</th>
                  <th className="pb-1 pr-2 font-medium">Birim Fiyat</th>
                  <th className="pb-1 pr-2 font-medium">Teslim</th>
                  <th className="pb-1 pr-2 font-medium">Not</th>
                  <th className="pb-1" />
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i}>
                    <td className="py-1 pr-2">
                      <Input
                        value={it.name}
                        onChange={(e) => setItem(i, { name: e.target.value })}
                        placeholder="Kalem adı"
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <Input
                        value={it.quantity}
                        onChange={(e) =>
                          setItem(i, { quantity: e.target.value })
                        }
                        inputMode="decimal"
                        className="w-20"
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <Input
                        value={it.unit}
                        onChange={(e) => setItem(i, { unit: e.target.value })}
                        className="w-20"
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <Input
                        value={it.unitPrice}
                        onChange={(e) =>
                          setItem(i, { unitPrice: e.target.value })
                        }
                        inputMode="decimal"
                        className="w-28"
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <Input
                        type="date"
                        value={it.deliveryDate}
                        onChange={(e) =>
                          setItem(i, { deliveryDate: e.target.value })
                        }
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <Input
                        value={it.note}
                        onChange={(e) => setItem(i, { note: e.target.value })}
                        placeholder="Kalem notu"
                        maxLength={500}
                        className="w-40"
                      />
                    </td>
                    <td className="py-1">
                      <button
                        type="button"
                        onClick={() => removeItem(i)}
                        className="text-zinc-400 hover:text-red-600"
                        title="Kalemi sil"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={addItem}
            className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            <Plus className="h-4 w-4" /> Kalem ekle
          </button>

          <div className="text-right text-sm font-semibold text-zinc-900">
            Yeni tutar: {draftTotal.toLocaleString("tr-TR")} {curSym}
          </div>

          <Field>
            <Label>Genel Teslim Tarihi (opsiyonel)</Label>
            <Input
              type="date"
              value={expDate}
              onChange={(e) => setExpDate(e.target.value)}
            />
          </Field>
          <Field>
            <Label>Açıklama (opsiyonel)</Label>
            <Textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Revizyon gerekçesi — alıcıya iletilir"
            />
          </Field>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setOpen(false)}>
            Vazgeç
          </Button>
          <Button onClick={submit} disabled={propose.isPending}>
            Revizyonu Gönder
          </Button>
        </DialogActions>
      </Dialog>

      {/* Ret gerekçe modalı (alıcı) */}
      <Dialog open={!!rejectFor} onClose={() => setRejectFor(null)}>
        <DialogTitle>Revizyonu Reddet</DialogTitle>
        <DialogDescription>
          Ret gerekçesi satıcıya iletilir (en az 10 karakter).
        </DialogDescription>
        <DialogBody>
          <Textarea
            rows={3}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Neden reddediyorsunuz?"
          />
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setRejectFor(null)}>
            Vazgeç
          </Button>
          <Button
            onClick={doReject}
            disabled={reject.isPending || rejectReason.trim().length < 10}
          >
            Reddet
          </Button>
        </DialogActions>
      </Dialog>
    </section>
  );
}
