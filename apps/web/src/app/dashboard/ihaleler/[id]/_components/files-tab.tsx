"use client";

import { AttachmentList } from "@/components/attachments/attachment-list";
import { AttachmentUpload } from "@/components/attachments/attachment-upload";
import { useAttachments } from "@/hooks/use-attachments";
import type { AttachmentSurface } from "@/lib/attachments/types";
import { Paperclip } from "lucide-react";

interface Props {
  surface?: AttachmentSurface;
  tender: { id: string; status: string };
}

const TENANT_EDITABLE_STATUSES = new Set(["DRAFT", "IN_APPROVAL"]);

export function FilesTab({ surface = "tenant", tender }: Props) {
  const isTenant = surface === "tenant";
  const canEdit = isTenant && TENANT_EDITABLE_STATUSES.has(tender.status);

  const { data: items } = useAttachments(surface, "TENDER_DOC", tender.id);

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-brand-900 flex items-center gap-2">
            <Paperclip className="h-4 w-4 text-slate-500" />
            İhale Dökümanları
            {items && items.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[11px] bg-slate-100 text-slate-600 font-normal">
                {items.length}
              </span>
            )}
          </h3>
          <p className="text-sm text-slate-600 mt-1">
            {isTenant
              ? "Şartname, teknik özellikler, çizimler ve diğer ek dosyaları yükleyin. Davet edilen tedarikçiler bu dosyaları görür."
              : "Alıcının ihale için paylaştığı dökümanlar."}
          </p>
        </div>
      </header>

      {canEdit ? (
        <AttachmentUpload
          surface="tenant"
          scope="TENDER_DOC"
          scopeRefId={tender.id}
        />
      ) : isTenant ? (
        <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          Yayınlanmış ihalelerde döküman ekleme veya silme yapılamaz.
        </div>
      ) : null}

      <AttachmentList
        surface={surface}
        scope="TENDER_DOC"
        scopeRefId={tender.id}
        canDelete={canEdit}
        emptyText={
          isTenant
            ? "Bu ihaleye eklenmiş döküman yok"
            : "Alıcı henüz döküman paylaşmadı"
        }
      />
    </div>
  );
}
