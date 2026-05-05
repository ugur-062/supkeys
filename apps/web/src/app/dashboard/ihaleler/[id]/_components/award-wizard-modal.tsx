"use client";

import { Button } from "@/components/ui/button";
import {
  useAwardFull,
  useAwardItemByItem,
  useFinalizeAward,
  useTenderBids,
  type AwardItemDecision,
} from "@/hooks/use-tenant-tenders";
import { extractErrorMessage } from "@/lib/tenders/error";
import type {
  TenderBidsListItem,
  TenderBidsResponse,
  TenderDetail,
} from "@/lib/tenders/types";
import { cn } from "@/lib/utils";
import * as Dialog from "@radix-ui/react-dialog";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Info,
  Loader2,
  Trophy,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  tender: TenderDetail;
}

type Step = "choose" | "full" | "item" | "confirm";
type Mode = "full" | "item";

export function AwardWizardModal({ open, onClose, tender }: Props) {
  const bidsQuery = useTenderBids(open ? tender.id : null);
  const [step, setStep] = useState<Step>("choose");
  const [mode, setMode] = useState<Mode>("full");
  const [selectedBidId, setSelectedBidId] = useState<string>("");
  const [decisions, setDecisions] = useState<Record<string, string>>({});

  const awardFull = useAwardFull(tender.id);
  const awardItemByItem = useAwardItemByItem(tender.id);
  const finalize = useFinalizeAward(tender.id);

  const isBusy =
    awardFull.isPending || awardItemByItem.isPending || finalize.isPending;

  const handleClose = (next: boolean) => {
    if (!next && !isBusy) {
      setStep("choose");
      setMode("full");
      setSelectedBidId("");
      setDecisions({});
      onClose();
    }
  };

  const handleConfirm = async () => {
    try {
      if (mode === "full") {
        await awardFull.mutateAsync(selectedBidId);
      } else {
        const decisionList: AwardItemDecision[] = tender.items.map((item) => ({
          tenderItemId: item.id,
          bidId: decisions[item.id]!,
        }));
        await awardItemByItem.mutateAsync(decisionList);
      }
      const finalizeResult = await finalize.mutateAsync();
      toast.success(
        `Kazandırma tamamlandı, ${finalizeResult.orderCount} sipariş oluşturuldu`,
      );
      handleClose(false);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Kazandırma başarısız"));
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-900/60 z-[60]" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[60]",
            "w-[calc(100vw-2rem)] max-w-3xl bg-white rounded-2xl shadow-2xl outline-none",
            "max-h-[90vh] flex flex-col",
          )}
        >
          <header className="px-5 py-4 border-b border-surface-border flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center flex-shrink-0">
                <Trophy className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <Dialog.Title className="font-display font-bold text-lg text-brand-900">
                  İhaleyi Kazandır
                </Dialog.Title>
                <Dialog.Description className="text-sm text-slate-500 mt-0.5">
                  Kazanan tedarikçiyi seçin. Bu işlem tek seferliktir,
                  sonradan değiştirilemez.
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Kapat"
                disabled={isBusy}
                className="p-1.5 rounded-lg hover:bg-surface-muted text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0 disabled:opacity-40"
              >
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </header>

          <div className="px-5 py-5 flex-1 overflow-y-auto">
            {bidsQuery.isLoading && !bidsQuery.data ? (
              <div className="py-12 flex items-center justify-center text-slate-500">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Teklifler yükleniyor…
              </div>
            ) : bidsQuery.isError || !bidsQuery.data ? (
              <div className="py-12 text-center text-danger-600">
                Teklifler yüklenemedi.
              </div>
            ) : step === "choose" ? (
              <ChooseStep mode={mode} onSelect={setMode} />
            ) : step === "full" ? (
              <FullAwardStep
                bidsData={bidsQuery.data}
                selectedBidId={selectedBidId}
                onSelect={setSelectedBidId}
              />
            ) : step === "item" ? (
              <ItemAwardStep
                tender={tender}
                bidsData={bidsQuery.data}
                decisions={decisions}
                onDecide={setDecisions}
              />
            ) : (
              <ConfirmAwardStep
                mode={mode}
                tender={tender}
                bidsData={bidsQuery.data}
                selectedBidId={selectedBidId}
                decisions={decisions}
              />
            )}
          </div>

          <footer className="px-5 py-4 border-t border-surface-border flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                if (step === "choose") handleClose(false);
                else if (step === "full" || step === "item") setStep("choose");
                else setStep(mode);
              }}
              disabled={isBusy}
            >
              {step === "choose" ? (
                "Vazgeç"
              ) : (
                <>
                  <ArrowLeft className="w-4 h-4" />
                  Geri
                </>
              )}
            </Button>

            {step === "choose" ? (
              <Button
                type="button"
                variant="primary"
                onClick={() => setStep(mode)}
              >
                İleri
                <ArrowRight className="w-4 h-4" />
              </Button>
            ) : step === "full" ? (
              <Button
                type="button"
                variant="primary"
                onClick={() => setStep("confirm")}
                disabled={!selectedBidId}
              >
                İleri
                <ArrowRight className="w-4 h-4" />
              </Button>
            ) : step === "item" ? (
              <Button
                type="button"
                variant="primary"
                onClick={() => setStep("confirm")}
                disabled={
                  Object.keys(decisions).length !== tender.items.length
                }
              >
                İleri ({Object.keys(decisions).length}/
                {tender.items.length})
                <ArrowRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                type="button"
                variant="primary"
                onClick={handleConfirm}
                loading={isBusy}
                disabled={isBusy}
                className="!bg-success-600 hover:!bg-success-700 focus:!ring-success-500"
              >
                <Trophy className="w-4 h-4" />
                Kazandırmayı Onayla
              </Button>
            )}
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ChooseStep({
  mode,
  onSelect,
}: {
  mode: Mode;
  onSelect: (m: Mode) => void;
}) {
  return (
    <div className="space-y-3">
      <RadioCard
        active={mode === "full"}
        onSelect={() => onSelect("full")}
        title="Tek Tedarikçiye Toplu Kazandır"
        description="Bir tedarikçi tüm kalemleri kazanır. En basit ve hızlı yöntem."
        note="Sadece tüm kalemlere teklif veren tedarikçiler arasından seçim yapabilirsiniz."
      />
      <RadioCard
        active={mode === "item"}
        onSelect={() => onSelect("item")}
        title="Kalem Bazlı Kazandır"
        description="Her kalem için farklı tedarikçi seçebilirsiniz. Birden fazla sipariş oluşur."
      />
    </div>
  );
}

function RadioCard({
  active,
  onSelect,
  title,
  description,
  note,
}: {
  active: boolean;
  onSelect: () => void;
  title: string;
  description: string;
  note?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full text-left rounded-xl border-2 p-4 transition",
        active
          ? "border-brand-400 bg-brand-50/50 ring-2 ring-brand-100"
          : "border-slate-200 bg-white hover:border-brand-300",
      )}
    >
      <div className="flex gap-3">
        <span
          className={cn(
            "mt-1 h-5 w-5 rounded-full border-2 flex items-center justify-center flex-shrink-0",
            active ? "border-brand-600" : "border-slate-300",
          )}
        >
          {active ? (
            <span className="h-2 w-2 rounded-full bg-brand-600" />
          ) : null}
        </span>
        <div className="flex-1">
          <p className="font-bold text-brand-900">{title}</p>
          <p className="text-sm text-slate-600 mt-1">{description}</p>
          {note ? (
            <p className="text-xs text-slate-500 mt-2">{note}</p>
          ) : null}
        </div>
      </div>
    </button>
  );
}

function FullAwardStep({
  bidsData,
  selectedBidId,
  onSelect,
}: {
  bidsData: TenderBidsResponse;
  selectedBidId: string;
  onSelect: (bidId: string) => void;
}) {
  const completeBids = bidsData.complete;

  if (completeBids.length === 0) {
    return (
      <div className="rounded-xl border border-warning-200 bg-warning-50 p-4 text-sm text-warning-800 flex gap-2">
        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        Tüm kalemlere teklif veren tedarikçi yok. Kalem bazlı kazandırma
        kullanın.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-brand-50 border border-brand-200 p-3 text-sm text-brand-800 flex gap-2">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
        Sadece tüm kalemlere teklif veren tedarikçiler listelenir.
      </div>
      <div className="space-y-2">
        {completeBids.map((bid, idx) => (
          <button
            key={bid.id}
            type="button"
            onClick={() => onSelect(bid.id)}
            className={cn(
              "w-full text-left rounded-xl border-2 p-4 transition",
              selectedBidId === bid.id
                ? "border-brand-400 bg-brand-50/40 ring-2 ring-brand-100"
                : "border-slate-200 bg-white hover:border-brand-300",
            )}
          >
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "mt-1 h-5 w-5 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                  selectedBidId === bid.id
                    ? "border-brand-600"
                    : "border-slate-300",
                )}
              >
                {selectedBidId === bid.id ? (
                  <span className="h-2 w-2 rounded-full bg-brand-600" />
                ) : null}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-brand-900">
                    {bid.supplier.companyName}
                  </p>
                  {idx === 0 ? (
                    <span className="text-[10px] px-1.5 py-0.5 bg-success-100 text-success-700 rounded font-bold">
                      EN DÜŞÜK
                    </span>
                  ) : null}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  VKN: {bid.supplier.taxNumber} · {bid.itemsBidCount}/
                  {bid.totalItems} kalem
                </p>
              </div>
              <p className="text-xl font-bold text-brand-700 tabular-nums whitespace-nowrap">
                {formatMoney(bid.totalAmount, bid.currency)}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function ItemAwardStep({
  tender,
  bidsData,
  decisions,
  onDecide,
}: {
  tender: TenderDetail;
  bidsData: TenderBidsResponse;
  decisions: Record<string, string>;
  onDecide: (next: Record<string, string>) => void;
}) {
  const allBids = useMemo(
    () => [...bidsData.complete, ...bidsData.incomplete],
    [bidsData.complete, bidsData.incomplete],
  );

  return (
    <div className="space-y-4">
      {tender.items.map((item) => {
        const bidsForItem = allBids
          .map((bid) => {
            const bi = bid.items.find((x) => x.tenderItemId === item.id);
            if (!bi || bi.unitPrice == null) return null;
            return { bid, bi };
          })
          .filter(
            (
              v,
            ): v is {
              bid: TenderBidsListItem;
              bi: TenderBidsListItem["items"][number];
            } => !!v,
          )
          .sort(
            (a, b) =>
              Number(a.bi.unitPrice ?? 0) - Number(b.bi.unitPrice ?? 0),
          );

        return (
          <div
            key={item.id}
            className="rounded-xl border border-slate-200 bg-white p-4"
          >
            <p className="font-bold text-brand-900">{item.name}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {Number(item.quantity).toLocaleString("tr-TR")} {item.unit}
              {item.targetUnitPrice
                ? ` · Hedef: ${Number(item.targetUnitPrice).toLocaleString(
                    "tr-TR",
                  )}`
                : ""}
            </p>

            {bidsForItem.length === 0 ? (
              <p className="text-xs text-slate-500 italic mt-3">
                Bu kaleme teklif veren tedarikçi yok.
              </p>
            ) : (
              <div className="mt-3 space-y-1.5">
                {bidsForItem.map(({ bid, bi }, idx) => (
                  <label
                    key={bid.id}
                    className={cn(
                      "flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition border",
                      decisions[item.id] === bid.id
                        ? "bg-brand-50 border-brand-300"
                        : "border-transparent hover:bg-slate-50",
                    )}
                  >
                    <input
                      type="radio"
                      name={`item-${item.id}`}
                      value={bid.id}
                      checked={decisions[item.id] === bid.id}
                      onChange={() =>
                        onDecide({ ...decisions, [item.id]: bid.id })
                      }
                      className="h-4 w-4 text-brand-600"
                    />
                    <div className="flex-1 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span className="font-semibold text-slate-900">
                          {bid.supplier.companyName}
                        </span>
                        {idx === 0 ? (
                          <span className="ml-2 text-[10px] px-1 py-0.5 bg-success-100 text-success-700 rounded font-bold">
                            EN DÜŞÜK
                          </span>
                        ) : null}
                      </div>
                      <p className="text-sm font-semibold tabular-nums">
                        {formatMoney(bi.unitPrice ?? "0", bi.currency)}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ConfirmAwardStep({
  mode,
  tender,
  bidsData,
  selectedBidId,
  decisions,
}: {
  mode: Mode;
  tender: TenderDetail;
  bidsData: TenderBidsResponse;
  selectedBidId: string;
  decisions: Record<string, string>;
}) {
  const summary = useMemo(() => {
    if (mode === "full") {
      const bid = bidsData.complete.find((b) => b.id === selectedBidId);
      if (!bid) return null;
      return {
        orderCount: 1,
        totalAmount: Number(bid.totalAmount),
        currency: bid.currency,
        winners: [
          {
            supplier: bid.supplier.companyName,
            items: tender.items.length,
            total: Number(bid.totalAmount),
            currency: bid.currency,
          },
        ],
      };
    }
    const allBids = [...bidsData.complete, ...bidsData.incomplete];
    const winnerMap = new Map<
      string,
      { supplier: string; items: number; total: number; currency: string }
    >();
    for (const [tenderItemId, bidId] of Object.entries(decisions)) {
      const bid = allBids.find((b) => b.id === bidId);
      if (!bid) continue;
      const bi = bid.items.find((x) => x.tenderItemId === tenderItemId);
      if (!bi || bi.totalPrice == null) continue;
      const entry = winnerMap.get(bidId) ?? {
        supplier: bid.supplier.companyName,
        items: 0,
        total: 0,
        currency: bid.currency,
      };
      entry.items += 1;
      entry.total += Number(bi.totalPrice);
      winnerMap.set(bidId, entry);
    }
    const winners = Array.from(winnerMap.values());
    return {
      orderCount: winners.length,
      totalAmount: winners.reduce((s, w) => s + w.total, 0),
      currency: tender.primaryCurrency,
      winners,
    };
  }, [
    mode,
    bidsData,
    selectedBidId,
    decisions,
    tender.items.length,
    tender.primaryCurrency,
  ]);

  if (!summary) {
    return (
      <div className="text-center text-slate-500 py-8">
        Özet oluşturulamadı.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-warning-50 border border-warning-200 p-4 flex gap-3 items-start">
        <AlertTriangle className="w-5 h-5 text-warning-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1 text-sm text-warning-800">
          <strong>Bu işlem geri alınamaz.</strong> Onayladıktan sonra
          kazandırma kalıcı olur, siparişler oluşur ve tüm tedarikçilere
          e-posta gönderilir.
        </div>
      </div>

      <div className="rounded-xl bg-success-50 border border-success-200 p-5 space-y-4">
        <h4 className="font-bold text-success-900">Kazandırma Özeti</h4>

        <div className="grid grid-cols-3 gap-3 pb-4 border-b border-success-200">
          <Stat
            label="Sipariş Sayısı"
            value={summary.orderCount.toString()}
          />
          <Stat
            label="Toplam Tutar"
            value={formatMoney(summary.totalAmount, summary.currency)}
          />
          <Stat
            label="Kazanan"
            value={summary.winners.length.toString()}
          />
        </div>

        <div className="space-y-2">
          {summary.winners.map((w, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between gap-3 bg-white p-3 rounded-lg"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Building2 className="w-4 h-4 text-brand-600 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="font-semibold text-brand-900 truncate">
                    {w.supplier}
                  </p>
                  <p className="text-xs text-slate-500">{w.items} kalem</p>
                </div>
              </div>
              <p className="font-bold text-brand-700 tabular-nums whitespace-nowrap">
                {formatMoney(w.total, w.currency)}
              </p>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs text-success-700 pt-2 border-t border-success-200">
          <CheckCircle2 className="w-4 h-4" />
          Tedarikçilere kazanan/kaybeden e-postaları otomatik gönderilir.
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-success-700 uppercase font-semibold tracking-wide">
        {label}
      </p>
      <p className="text-xl font-bold text-success-900 mt-1">{value}</p>
    </div>
  );
}

function formatMoney(value: string | number, currency: string): string {
  const num = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(num)) return "—";
  try {
    return num.toLocaleString("tr-TR", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    });
  } catch {
    return `${num.toFixed(2)} ${currency}`;
  }
}
