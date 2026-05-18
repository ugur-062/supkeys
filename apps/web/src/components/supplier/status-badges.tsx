import { cn } from "@/lib/utils";

/**
 * V2-5 — Tedarikçi panelinde bid + order durum rozetleri.
 * Mevcut tenders/status-badge.tsx tenant tarafı içinde — burada özelleşmiş
 * supplier semantiği (TENANT_USER yerine SUPPLIER_USER perspektifi).
 */

type Size = "md" | "lg";

const SIZE_CLASSES: Record<Size, string> = {
  md: "text-[11px] px-2 py-0.5",
  lg: "text-xs px-2.5 py-1",
};

const BID_STATUS_META: Record<
  string,
  { label: string; className: string }
> = {
  NOT_STARTED: {
    label: "Başlanmadı",
    className: "bg-slate-100 text-slate-600 border-slate-200",
  },
  DRAFT: {
    label: "Taslak",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
  SUBMITTED: {
    label: "Gönderildi",
    className: "bg-violet-50 text-violet-700 border-violet-200",
  },
  AWARDED: {
    label: "Kazandın",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  AWARDED_FULL: {
    label: "Kazandın",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  AWARDED_PARTIAL: {
    label: "Kısmen Kazandın",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  LOST: {
    label: "Kaybettin",
    className: "bg-rose-50 text-rose-700 border-rose-200",
  },
  REJECTED: {
    label: "Reddedildi",
    className: "bg-rose-50 text-rose-700 border-rose-200",
  },
  WITHDRAWN: {
    label: "Geri Çekildi",
    className: "bg-slate-100 text-slate-600 border-slate-200",
  },
};

const ORDER_STATUS_META: Record<
  string,
  { label: string; className: string; dot: string }
> = {
  PENDING: {
    label: "Onay Bekliyor",
    className: "bg-amber-50 text-amber-700 border-amber-200",
    dot: "bg-amber-500",
  },
  ACCEPTED: {
    label: "Onaylandı",
    className: "bg-blue-50 text-blue-700 border-blue-200",
    dot: "bg-blue-500",
  },
  IN_DELIVERY: {
    label: "Gönderildi",
    className: "bg-indigo-50 text-indigo-700 border-indigo-200",
    dot: "bg-indigo-500",
  },
  COMPLETED: {
    label: "Tamamlandı",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
  },
  REJECTED: {
    label: "Reddedildi",
    className: "bg-orange-50 text-orange-700 border-orange-200",
    dot: "bg-orange-500",
  },
  CANCELLED: {
    label: "İptal Edildi",
    className: "bg-rose-50 text-rose-700 border-rose-200",
    dot: "bg-rose-500",
  },
  // Legacy support — eski kayıtlar için fallback
  IN_PROGRESS: {
    label: "Üretimde",
    className: "bg-indigo-50 text-indigo-700 border-indigo-200",
    dot: "bg-indigo-500",
  },
  DELIVERED: {
    label: "Tamamlandı",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
  },
};

export function SupplierBidStatusBadge({
  status,
  size = "md",
}: {
  status: string;
  size?: Size;
}) {
  const meta = BID_STATUS_META[status] ?? BID_STATUS_META.NOT_STARTED!;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md font-semibold border whitespace-nowrap",
        SIZE_CLASSES[size],
        meta.className,
      )}
    >
      {meta.label}
    </span>
  );
}

export function SupplierOrderStatusBadge({
  status,
  size = "md",
}: {
  status: string;
  size?: Size;
}) {
  const meta = ORDER_STATUS_META[status] ?? ORDER_STATUS_META.PENDING!;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md font-semibold border whitespace-nowrap",
        SIZE_CLASSES[size],
        meta.className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}

/**
 * Tender + bid status'unun TEDARİKÇİ perspektifinden okunabilir bir
 * "etkin durum" etiketine dönüşümü.
 *   OPEN_FOR_BIDS + null bid → "Davet Edildi"
 *   OPEN_FOR_BIDS + DRAFT bid → "Taslak Teklifim"
 *   OPEN_FOR_BIDS + SUBMITTED → "Teklif Gönderildi"
 *   IN_AWARD + SUBMITTED → "Değerlendiriliyor"
 *   AWARDED + AWARDED_FULL/PARTIAL → "Kazandın"
 *   AWARDED + LOST → "Kaybettin"
 *   AWARDED + null bid → "Kapandı (teklif vermedin)"
 *   CANCELLED → "İptal Edildi"
 */
export function deriveSupplierTenderState(
  tenderStatus: string,
  bidStatus: string | null | undefined,
): { label: string; className: string; tone: "neutral" | "info" | "active" | "win" | "lose" | "warn" } {
  if (tenderStatus === "CANCELLED") {
    return {
      label: "İptal Edildi",
      className: "bg-slate-100 text-slate-600 border-slate-200",
      tone: "neutral",
    };
  }
  if (
    bidStatus === "AWARDED_FULL" ||
    bidStatus === "AWARDED_PARTIAL" ||
    bidStatus === "AWARDED"
  ) {
    return {
      label: "Kazandın",
      className: "bg-emerald-50 text-emerald-700 border-emerald-200",
      tone: "win",
    };
  }
  if (bidStatus === "LOST") {
    return {
      label: "Kaybettin",
      className: "bg-rose-50 text-rose-700 border-rose-200",
      tone: "lose",
    };
  }
  if (bidStatus === "WITHDRAWN") {
    return {
      label: "Geri Çekildi",
      className: "bg-slate-100 text-slate-600 border-slate-200",
      tone: "neutral",
    };
  }
  if (tenderStatus === "OPEN_FOR_BIDS") {
    if (bidStatus === "DRAFT") {
      return {
        label: "Taslak Teklifim",
        className: "bg-amber-50 text-amber-700 border-amber-200",
        tone: "warn",
      };
    }
    if (bidStatus === "SUBMITTED") {
      return {
        label: "Teklif Gönderildi",
        className: "bg-violet-50 text-violet-700 border-violet-200",
        tone: "active",
      };
    }
    return {
      label: "Davet Edildi",
      className: "bg-blue-50 text-blue-700 border-blue-200",
      tone: "info",
    };
  }
  if (tenderStatus === "IN_AWARD" || tenderStatus === "IN_AWARD_APPROVAL") {
    return {
      label: "Değerlendiriliyor",
      className: "bg-violet-50 text-violet-700 border-violet-200",
      tone: "active",
    };
  }
  if (tenderStatus === "AWARDED" || tenderStatus === "COMPLETED") {
    return {
      label: bidStatus
        ? "Kapandı"
        : "Kapandı (teklif yok)",
      className: "bg-slate-100 text-slate-600 border-slate-200",
      tone: "neutral",
    };
  }
  return {
    label: tenderStatus,
    className: "bg-slate-100 text-slate-600 border-slate-200",
    tone: "neutral",
  };
}
