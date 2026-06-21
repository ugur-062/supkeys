"use client";

import { Badge } from "@/components/catalyst/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/catalyst/table";
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
  /** Alıcı tarafı `true` geçer; tedarikçi tarafında kolon hiç görünmez. */
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
    <Table dense className="[--gutter:--spacing(4)]">
      <TableHead>
        <TableRow>
          <TableHeader className="w-10">#</TableHeader>
          <TableHeader>Kalem</TableHeader>
          <TableHeader className="text-right">Miktar</TableHeader>
          <TableHeader className="hidden sm:table-cell">Birim</TableHeader>
          <TableHeader className="hidden font-mono md:table-cell">
            Stok Kodu
          </TableHeader>
          {showTargetPrice ? (
            <TableHeader className="text-right">Hedef Fiyat</TableHeader>
          ) : null}
          <TableHeader>Soru</TableHeader>
        </TableRow>
      </TableHead>
      <TableBody>
        {items.map((it) => (
          <TableRow key={it.id}>
            <TableCell className="tabular-nums text-zinc-400">
              {it.orderIndex}
            </TableCell>
            <TableCell className="font-medium">
              <div className="text-zinc-900">{it.name}</div>
              {it.description ? (
                <div
                  className="mt-0.5 max-w-md truncate text-xs text-zinc-500"
                  title={it.description}
                >
                  {it.description}
                </div>
              ) : null}
            </TableCell>
            <TableCell className="text-right tabular-nums text-zinc-900">
              {fmtNumber(it.quantity, 4)}
            </TableCell>
            <TableCell className="hidden text-zinc-500 sm:table-cell">
              {it.unit}
            </TableCell>
            <TableCell className="hidden font-mono text-xs text-zinc-500 md:table-cell">
              {it.materialCode || "—"}
            </TableCell>
            {showTargetPrice ? (
              <TableCell className="text-right tabular-nums text-zinc-500">
                {it.targetUnitPrice
                  ? `${fmtNumber(it.targetUnitPrice)} ${CURRENCY_SYMBOL[currency]}`
                  : "—"}
              </TableCell>
            ) : null}
            <TableCell>
              {it.questions && it.questions.length > 0 ? (
                <Badge title={it.questions.map((q) => `• ${q.text}`).join("\n")}>
                  <HelpCircle className="h-3 w-3" />
                  {it.questions.length} soru
                </Badge>
              ) : it.customQuestion ? (
                <Badge title={it.customQuestion}>
                  <HelpCircle className="h-3 w-3" />
                  Var
                </Badge>
              ) : (
                <span className="text-xs text-zinc-400">—</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
