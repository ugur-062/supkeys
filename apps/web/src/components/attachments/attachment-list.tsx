"use client";

import {
  useAttachments,
  useDeleteAttachment,
  useDownloadAttachment,
} from "@/hooks/use-attachments";
import type {
  AttachmentItem,
  AttachmentScope,
  AttachmentSurface,
} from "@/lib/attachments/types";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  Download,
  File as FileIcon,
  FileImage,
  FileSpreadsheet,
  FileText,
  Loader2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

interface Props {
  surface: AttachmentSurface;
  scope: AttachmentScope;
  scopeRefId: string;
  canDelete?: boolean;
  emptyText?: string;
}

export function AttachmentList({
  surface,
  scope,
  scopeRefId,
  canDelete = false,
  emptyText,
}: Props) {
  const { data, isLoading } = useAttachments(surface, scope, scopeRefId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-3 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Yükleniyor…
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="text-sm text-slate-500 py-4 text-center bg-slate-50/50 border border-slate-200 border-dashed rounded-lg">
        {emptyText ?? "Henüz dosya yüklenmedi"}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {data.map((att) => (
        <AttachmentRow
          key={att.id}
          surface={surface}
          attachment={att}
          canDelete={canDelete}
        />
      ))}
    </div>
  );
}

function AttachmentRow({
  surface,
  attachment,
  canDelete,
}: {
  surface: AttachmentSurface;
  attachment: AttachmentItem;
  canDelete: boolean;
}) {
  const downloadMutation = useDownloadAttachment(surface);
  const deleteMutation = useDeleteAttachment(surface);

  const Icon = pickIcon(attachment.mimeType);

  return (
    <div className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-lg hover:border-brand-300 transition-colors">
      <div className="h-10 w-10 rounded-lg bg-slate-50 flex items-center justify-center flex-shrink-0">
        <Icon className="h-5 w-5 text-slate-600" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-brand-900 truncate">
          {attachment.originalFilename}
        </p>
        <p className="text-xs text-slate-500 truncate">
          {formatFileSize(attachment.fileSize)}
          {attachment.uploadedBy
            ? ` · ${attachment.uploadedBy.firstName} ${attachment.uploadedBy.lastName}`
            : ""}
          {" · "}
          {format(new Date(attachment.createdAt), "d MMM HH:mm", {
            locale: tr,
          })}
        </p>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          type="button"
          onClick={() => downloadMutation.mutate(attachment)}
          disabled={downloadMutation.isPending}
          className="p-2 hover:bg-brand-50 rounded-lg text-brand-600 disabled:opacity-50"
          title="İndir"
          aria-label="İndir"
        >
          {downloadMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
        </button>

        {canDelete && (
          <button
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  `"${attachment.originalFilename}" silinecek, emin misin?`,
                )
              ) {
                deleteMutation.mutate(attachment.id, {
                  onSuccess: () => toast.success("Dosya silindi"),
                });
              }
            }}
            disabled={deleteMutation.isPending}
            className="p-2 hover:bg-danger-50 rounded-lg text-danger-600 disabled:opacity-50"
            title="Sil"
            aria-label="Sil"
          >
            {deleteMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}

function pickIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return FileImage;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel"))
    return FileSpreadsheet;
  if (mimeType === "application/pdf") return FileText;
  if (mimeType.includes("word")) return FileText;
  return FileIcon;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
