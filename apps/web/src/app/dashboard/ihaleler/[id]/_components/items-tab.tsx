"use client";

import { Badge } from "@/components/catalyst/badge";
import { CURRENCY_SYMBOL } from "@/lib/tenders/labels";
import type { Currency, ItemQuestion } from "@/lib/tenders/types";
import { HelpCircle, Inbox } from "lucide-react";

function fmtNumber(value: string | null | undefined, decimals = 2): string {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return n.toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

interface ItemRow {
  id: string;
  orderIndex: number;
  name: string;
  description: string | null;
  quantity: string;
  unit: string;
  materialCode: string | null;
  requiredByDate: string | null;
  targetUnitPrice?: string | null;
  customQuestion: string | null;
  questions?: ItemQuestion[] | null;
}

interface Props {
  items: ItemRow[];
  currency: Currency;
  /** Alıcı tarafı `true` geçer; tedarikçi tarafında hedef fiyat hiç görünmez. */
  showTargetPrice?: boolean;
}

export function ItemsTab({ items, currency, showTargetPrice = false }: Props) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100">
          <Inbox className="h-6 w-6 text-zinc-400" />
        </div>
        <p className="mt-3 font-semibold text-zinc-950">Kalem yok</p>
        <p className="mt-1 text-sm text-zinc-500">
          Bu ihaleye henüz kalem eklenmemiş.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {items.map((it) => {
        const questions =
          it.questions && it.questions.length > 0
            ? it.questions.map((q) => q.text)
            : it.customQuestion
              ? [it.customQuestion]
              : [];
        return (
          <div
            key={it.id}
            className="rounded-xl border border-zinc-950/5 bg-white p-4 transition-colors hover:border-zinc-950/15"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-xs font-bold text-zinc-600">
                  {it.orderIndex}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold leading-tight text-zinc-900">
                    {it.name}
                  </p>
                  {it.materialCode ? (
                    <p className="mt-0.5 font-mono text-xs text-zinc-500">
                      {it.materialCode}
                    </p>
                  ) : null}
                  {it.description ? (
                    <p className="mt-1 text-xs text-zinc-500">
                      {it.description}
                    </p>
                  ) : null}
                  {questions.length > 0 ? (
                    <span className="mt-2 inline-flex">
                      <Badge title={questions.map((q) => `• ${q}`).join("\n")}>
                        <HelpCircle className="h-3 w-3" />
                        {questions.length} soru
                      </Badge>
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-bold tabular-nums text-zinc-900">
                  {fmtNumber(it.quantity, 4)}{" "}
                  <span className="font-normal text-zinc-500">{it.unit}</span>
                </p>
                {showTargetPrice ? (
                  <p className="mt-0.5 text-xs tabular-nums text-zinc-500">
                    {it.targetUnitPrice
                      ? `Hedef: ${fmtNumber(it.targetUnitPrice)} ${CURRENCY_SYMBOL[currency]}`
                      : "Hedef yok"}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
