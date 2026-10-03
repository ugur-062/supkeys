import { useTranslations } from "next-intl";
import { useListingStatusLabel } from "@/i18n/domain";
import { cn } from "@/lib/utils";

export type ListingStatus =
  | "DRAFT"
  | "IN_APPROVAL"
  | "OPEN"
  | "CLOSED"
  | "IN_AWARD"
  | "IN_AWARD_APPROVAL"
  | "AWARDED"
  | "CLOSED_NO_AWARD"
  | "CANCELLED";
export type ListingFormat = "RFQ" | "ENGLISH_AUCTION";

/** Renk/stil her görünümün kendi sorumluluğunda; metin katalogdan. */
const STATUS_CLASS: Record<ListingStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-600 border-slate-200",
  IN_APPROVAL: "bg-amber-50 text-amber-700 border-amber-200",
  OPEN: "bg-success-50 text-success-600 border-success-500/30",
  CLOSED: "bg-warning-50 text-warning-600 border-warning-500/30",
  IN_AWARD: "bg-blue-50 text-blue-700 border-blue-200",
  IN_AWARD_APPROVAL: "bg-amber-50 text-amber-700 border-amber-200",
  AWARDED: "bg-zinc-100 text-zinc-700 border-zinc-200",
  CLOSED_NO_AWARD: "bg-zinc-100 text-zinc-600 border-zinc-200",
  CANCELLED: "bg-danger-50 text-danger-600 border-danger-500/30",
};

const FORMAT_CLASS: Record<ListingFormat, string> = {
  RFQ: "bg-zinc-50 text-zinc-700 border-zinc-200",
  ENGLISH_AUCTION: "bg-blue-50 text-blue-700 border-blue-200",
};

export function TenderStatusBadge({
  status,
  className,
}: {
  status: ListingStatus;
  className?: string;
}) {
  const statusLabel = useListingStatusLabel();
  // Bilinmeyen durum DRAFT'a düşer (kırılmaz).
  const known: ListingStatus = status in STATUS_CLASS ? status : "DRAFT";
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium",
        STATUS_CLASS[known],
        className,
      )}
    >
      {statusLabel(known)}
    </span>
  );
}

export function TenderTypeBadge({
  format,
  className,
}: {
  format: ListingFormat | null;
  className?: string;
}) {
  const t = useTranslations("web.panel.requests.statusBadge");
  const key = format ?? "RFQ";
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-semibold",
        FORMAT_CLASS[key],
        className,
      )}
    >
      {key === "ENGLISH_AUCTION" ? t("pazarlik") : t("teklifToplama")}
    </span>
  );
}
