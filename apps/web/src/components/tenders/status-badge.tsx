import { cn } from "@/lib/utils";

export type ListingStatus =
  | "DRAFT"
  | "OPEN"
  | "CLOSED"
  | "AWARDED"
  | "CANCELLED";
export type ListingFormat = "RFQ" | "ENGLISH_AUCTION";

const STATUS_META: Record<ListingStatus, { label: string; className: string }> =
  {
    DRAFT: {
      label: "Taslak",
      className: "bg-slate-100 text-slate-600 border-slate-200",
    },
    OPEN: {
      label: "Yayında",
      className: "bg-success-50 text-success-600 border-success-500/30",
    },
    CLOSED: {
      label: "Teklife Kapalı",
      className: "bg-warning-50 text-warning-600 border-warning-500/30",
    },
    AWARDED: {
      label: "Tamamlandı",
      className: "bg-zinc-100 text-zinc-700 border-zinc-200",
    },
    CANCELLED: {
      label: "İptal/Kapalı",
      className: "bg-danger-50 text-danger-600 border-danger-500/30",
    },
  };

const FORMAT_META: Record<ListingFormat, { label: string; className: string }> =
  {
    RFQ: {
      label: "Teklif Toplama",
      className: "bg-zinc-50 text-zinc-700 border-zinc-200",
    },
    ENGLISH_AUCTION: {
      label: "Açık Eksiltme",
      className: "bg-blue-50 text-blue-700 border-blue-200",
    },
  };

export function TenderStatusBadge({
  status,
  className,
}: {
  status: ListingStatus;
  className?: string;
}) {
  const meta = STATUS_META[status] ?? STATUS_META.DRAFT;
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium",
        meta.className,
        className,
      )}
    >
      {meta.label}
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
  const meta = FORMAT_META[format ?? "RFQ"];
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-semibold",
        meta.className,
        className,
      )}
    >
      {meta.label}
    </span>
  );
}
