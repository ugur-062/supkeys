"use client";

import type { BidFormValues } from "@/lib/tenders/bid-form-schema";
import { CURRENCY_SYMBOL } from "@/lib/tenders/labels";
import type { Currency } from "@/lib/tenders/types";
import { cn } from "@/lib/utils";
import { Controller, useFormContext } from "react-hook-form";

interface Props {
  allowedCurrencies: Currency[];
}

export function CurrencySelector({ allowedCurrencies }: Props) {
  const { control } = useFormContext<BidFormValues>();

  return (
    <Controller
      control={control}
      name="currency"
      render={({ field }) => (
        <div className="grid grid-cols-3 gap-2">
          {allowedCurrencies.map((c) => {
            const checked = field.value === c;
            return (
              <label
                key={c}
                className={cn(
                  "flex items-center justify-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-colors",
                  checked
                    ? "border-brand-500 bg-brand-50/40"
                    : "border-slate-200 hover:bg-slate-50",
                )}
              >
                <input
                  type="radio"
                  name="bid-currency"
                  value={c}
                  checked={checked}
                  onChange={() => field.onChange(c)}
                />
                <span className="text-sm font-semibold text-brand-900">
                  {CURRENCY_SYMBOL[c]} {c}
                </span>
              </label>
            );
          })}
        </div>
      )}
    />
  );
}
