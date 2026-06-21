import type { Currency } from "@/lib/format-currency";
import { cn } from "@/lib/utils";

const palette: Record<Currency, string> = {
  TRY: "bg-success-50 text-success-600 border-success-200",
  USD: "bg-zinc-50 text-zinc-700 border-zinc-200",
  EUR: "bg-zinc-50 text-zinc-700 border-zinc-200",
  GBP: "bg-zinc-50 text-zinc-700 border-zinc-200",
  CHF: "bg-rose-50 text-rose-700 border-rose-200",
  JPY: "bg-amber-50 text-amber-700 border-amber-200",
  AED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  CNY: "bg-orange-50 text-orange-700 border-orange-200",
};

const symbolMap: Record<Currency, string> = {
  TRY: "₺",
  USD: "$",
  EUR: "€",
  GBP: "£",
  CHF: "₣",
  JPY: "¥",
  AED: "د.إ",
  CNY: "¥",
};

interface Props {
  currency: Currency;
  className?: string;
  /** "${symbol} CODE" yerine sadece CODE göster. */
  codeOnly?: boolean;
}

export function CurrencyBadge({ currency, className, codeOnly = false }: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold border",
        palette[currency],
        className,
      )}
    >
      {!codeOnly && <span>{symbolMap[currency]}</span>}
      <span>{currency}</span>
    </span>
  );
}
