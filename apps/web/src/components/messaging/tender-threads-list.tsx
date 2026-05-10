"use client";

import { useTenderThreadsForTenant } from "@/hooks/use-messages";
import { format, isToday } from "date-fns";
import { tr } from "date-fns/locale";
import { Building2, Loader2 } from "lucide-react";

interface Props {
  tenderId: string;
  selectedSupplierId: string | null;
  onSelect: (supplierId: string) => void;
}

/**
 * V2-4 — Tenant TENDER context için sol-rail tedarikçi listesi.
 * Davet edilen her tedarikçiyle ayrı thread; alıcı buradan birini seçer.
 */
export function TenderThreadsList({
  tenderId,
  selectedSupplierId,
  onSelect,
}: Props) {
  const { data, isLoading } = useTenderThreadsForTenant(tenderId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <p className="text-xs text-slate-500 py-4 text-center">
        İhaleye henüz tedarikçi davet edilmemiş.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      {data.map((t) => {
        const isSelected = selectedSupplierId === t.supplierId;
        const sentAt = t.lastMessageAt ? new Date(t.lastMessageAt) : null;
        return (
          <button
            type="button"
            key={t.supplierId}
            onClick={() => onSelect(t.supplierId)}
            className={`w-full text-left p-2.5 rounded-lg border transition-colors ${
              isSelected
                ? "border-brand-500 bg-brand-50"
                : "border-slate-200 bg-white hover:border-brand-300 hover:bg-slate-50"
            }`}
          >
            <div className="flex items-start gap-2.5">
              <div className="h-9 w-9 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
                <Building2 className="h-4 w-4 text-brand-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-sm text-brand-900 truncate">
                    {t.supplierName}
                  </p>
                  {t.unread ? (
                    <span
                      className="bg-danger-500 h-2 w-2 rounded-full flex-shrink-0"
                      title="Yeni mesaj"
                    />
                  ) : null}
                </div>
                {t.lastMessageContent ? (
                  <p className="text-xs text-slate-600 truncate mt-0.5">
                    {t.lastMessageSenderType === "TENANT_USER" ? "Sen: " : ""}
                    {t.lastMessageContent}
                  </p>
                ) : (
                  <p className="text-xs text-slate-400 mt-0.5 italic">
                    Henüz mesaj yok
                  </p>
                )}
                {sentAt ? (
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {isToday(sentAt)
                      ? format(sentAt, "HH:mm", { locale: tr })
                      : format(sentAt, "d MMM HH:mm", { locale: tr })}
                  </p>
                ) : null}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
