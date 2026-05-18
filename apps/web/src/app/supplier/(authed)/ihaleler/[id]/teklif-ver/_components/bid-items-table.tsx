"use client";

import type { Currency, SupplierTenderItem } from "@/lib/tenders/types";
import { BidItemRow } from "./bid-item-row";

interface Props {
  tenderItems: SupplierTenderItem[];
  currency: Currency;
}

export function BidItemsTable({ tenderItems, currency }: Props) {
  return (
    <div className="space-y-3">
      {tenderItems.map((item, idx) => (
        <BidItemRow
          key={item.id}
          index={idx}
          tenderItem={item}
          currency={currency}
        />
      ))}
    </div>
  );
}
