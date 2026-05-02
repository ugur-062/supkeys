"use client";

import type { TenderAttachment } from "@/lib/tenders/types";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { FileText, Paperclip } from "lucide-react";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function FilesTab({ attachments }: { attachments: TenderAttachment[] }) {
  if (attachments.length === 0) {
    return (
      <div className="card p-12 text-center">
        <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 flex items-center justify-center">
          <Paperclip className="w-6 h-6 text-slate-400" />
        </div>
        <p className="mt-3 font-medium text-brand-900">Dosya yok</p>
        <p className="text-sm text-slate-500 mt-1">
          Bu ihaleye henüz dosya eklenmedi. Dosya yükleme E.2'de gelecek.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {attachments.map((att) => (
        <article
          key={att.id}
          className="card p-3 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-lg bg-brand-50 flex items-center justify-center text-brand-600 shrink-0">
              <FileText className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-brand-900 truncate">
                {att.fileName}
              </p>
              <p className="text-xs text-slate-500">
                {formatBytes(att.fileSize)} ·{" "}
                {format(new Date(att.uploadedAt), "d MMM yyyy", { locale: tr })}
              </p>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
