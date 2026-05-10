"use client";

import { MessageThread } from "@/components/messaging/message-thread";
import { TenderThreadsList } from "@/components/messaging/tender-threads-list";
import { useState } from "react";

/**
 * V2-4 — Tenant TENDER context: davet edilen tedarikçiler listesi (sol) +
 * seçili tedarikçiyle thread (sağ). Tedarikçiler birbirini görmez.
 */
export function TenderMessagesTab({ tenderId }: { tenderId: string }) {
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(
    null,
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      <div className="lg:col-span-4 lg:max-h-[600px] lg:overflow-y-auto bg-white border border-slate-200 rounded-2xl p-3">
        <h4 className="text-sm font-bold text-brand-900 mb-3 px-1">
          Tedarikçiler
        </h4>
        <TenderThreadsList
          tenderId={tenderId}
          selectedSupplierId={selectedSupplierId}
          onSelect={setSelectedSupplierId}
        />
      </div>

      <div className="lg:col-span-8">
        {selectedSupplierId ? (
          <MessageThread
            surface="tenant"
            context="TENDER"
            contextRefId={tenderId}
            targetSupplierId={selectedSupplierId}
            currentUserType="TENANT_USER"
          />
        ) : (
          <div className="flex items-center justify-center h-[600px] text-slate-400 text-sm border border-slate-200 rounded-2xl bg-slate-50">
            Soldan bir tedarikçi seçin.
          </div>
        )}
      </div>
    </div>
  );
}
