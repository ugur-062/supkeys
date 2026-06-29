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

/**
 * İlan durum etiketleri — TEK kaynak. Tüm görünümler (badge, detay, filtre)
 * etiket metnini buradan alır; renk/stil her görünümün kendi sorumluluğunda.
 */
export const LISTING_STATUS_LABELS: Record<ListingStatus, string> = {
  DRAFT: "Taslak",
  IN_APPROVAL: "Onayda",
  OPEN: "Yayında",
  CLOSED: "Teklife Kapalı",
  IN_AWARD: "Kazandırmada",
  IN_AWARD_APPROVAL: "Kazandırma Onayı",
  AWARDED: "Tamamlandı",
  CLOSED_NO_AWARD: "Kazansız Kapandı",
  CANCELLED: "İptal/Kapalı",
};

const STATUS_META: Record<ListingStatus, { label: string; className: string }> =
  {
    DRAFT: {
      label: LISTING_STATUS_LABELS.DRAFT,
      className: "bg-slate-100 text-slate-600 border-slate-200",
    },
    IN_APPROVAL: {
      label: LISTING_STATUS_LABELS.IN_APPROVAL,
      className: "bg-amber-50 text-amber-700 border-amber-200",
    },
    OPEN: {
      label: LISTING_STATUS_LABELS.OPEN,
      className: "bg-success-50 text-success-600 border-success-500/30",
    },
    CLOSED: {
      label: LISTING_STATUS_LABELS.CLOSED,
      className: "bg-warning-50 text-warning-600 border-warning-500/30",
    },
    IN_AWARD: {
      label: LISTING_STATUS_LABELS.IN_AWARD,
      className: "bg-blue-50 text-blue-700 border-blue-200",
    },
    IN_AWARD_APPROVAL: {
      label: LISTING_STATUS_LABELS.IN_AWARD_APPROVAL,
      className: "bg-amber-50 text-amber-700 border-amber-200",
    },
    AWARDED: {
      label: LISTING_STATUS_LABELS.AWARDED,
      className: "bg-zinc-100 text-zinc-700 border-zinc-200",
    },
    CLOSED_NO_AWARD: {
      label: LISTING_STATUS_LABELS.CLOSED_NO_AWARD,
      className: "bg-zinc-100 text-zinc-600 border-zinc-200",
    },
    CANCELLED: {
      label: LISTING_STATUS_LABELS.CANCELLED,
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
