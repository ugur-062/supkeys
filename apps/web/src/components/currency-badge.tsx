import type { Currency } from "@/lib/format-currency";
import { cn } from "@/lib/utils";

const palette: Record<Currency, string> = {
  TRY: "bg-success-50 text-success-600 border-success-200",
  USD: "bg-blue-50 text-blue-700 border-blue-200",
  EUR: "bg-violet-50 text-violet-700 border-violet-200",
};

const symbolMap: Record<Currency, string> = {
  TRY: "₺",
  USD: "$",
  EUR: "€",
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
