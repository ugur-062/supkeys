"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/catalyst/table";
import { IconButton } from "@/components/ui/icon-button";
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
      <div className="flex items-center gap-2 py-3 text-sm text-zinc-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Yükleniyor…
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-950/10 bg-zinc-50/50 py-6 text-center text-sm text-zinc-500">
        {emptyText ?? "Henüz dosya yüklenmedi"}
      </div>
    );
  }

  return (
    <Table dense className="[--gutter:--spacing(3)]">
      <TableHead>
        <TableRow>
          <TableHeader>Dosya</TableHeader>
          <TableHeader className="hidden sm:table-cell">Boyut</TableHeader>
          <TableHeader className="hidden md:table-cell">Yükleyen</TableHeader>
          <TableHeader className="hidden sm:table-cell">Tarih</TableHeader>
          <TableHeader className="text-right">İşlem</TableHeader>
        </TableRow>
      </TableHead>
      <TableBody>
        {data.map((att) => (
          <AttachmentRow
            key={att.id}
            surface={surface}
            attachment={att}
            canDelete={canDelete}
          />
        ))}
      </TableBody>
    </Table>
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
    <TableRow>
      <TableCell className="font-medium">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100">
            <Icon className="h-4 w-4 text-zinc-600" />
          </div>
          <span className="truncate text-zinc-900">
            {attachment.originalFilename}
          </span>
        </div>
      </TableCell>
      <TableCell className="hidden text-zinc-500 sm:table-cell">
        {formatFileSize(attachment.fileSize)}
      </TableCell>
      <TableCell className="hidden text-zinc-500 md:table-cell">
        {attachment.uploadedBy
          ? `${attachment.uploadedBy.firstName} ${attachment.uploadedBy.lastName}`
          : "—"}
      </TableCell>
      <TableCell className="hidden text-zinc-500 sm:table-cell">
        {format(new Date(attachment.createdAt), "d MMM HH:mm", { locale: tr })}
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-1">
          <IconButton
            onClick={() => downloadMutation.mutate(attachment)}
            disabled={downloadMutation.isPending}
            title="İndir"
            aria-label="İndir"
          >
            {downloadMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
          </IconButton>
          {canDelete ? (
            <IconButton
              tone="danger"
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
              title="Sil"
              aria-label="Sil"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </IconButton>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
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
