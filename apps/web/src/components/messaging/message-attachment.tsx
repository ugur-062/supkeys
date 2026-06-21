"use client";

import { useDownloadAttachment } from "@/hooks/use-attachments";
import type { AttachmentItem, AttachmentSurface } from "@/lib/attachments/types";
import { Download, FileText, Loader2 } from "lucide-react";
import { useState } from "react";

interface Props {
  attachmentId: string;
  isMine: boolean;
  surface: AttachmentSurface;
}

/**
 * V2-4 — Mesaj balonu içinde dosya satırı.
 * Click → presigned URL ile indirme.
 *
 * NOTE: Ekonomik versiyon — backend'in mesaj API'si attachment metadata'sını
 * inline döndürmüyor. İlk click'te download endpoint'inden meta + URL çekilir.
 * V2.5 iyileştirmesi: backend mesajla beraber attachment metadata array'i
 * dönsün (originalFilename, mimeType, fileSize).
 */
export function MessageAttachment({ attachmentId, isMine, surface }: Props) {
  const downloadMutation = useDownloadAttachment(surface);
  const [filename, setFilename] = useState<string>("Dosya");

  const handleClick = () => {
    // Stub AttachmentItem — useDownloadAttachment originalFilename'i kullanır.
    // Filename burada bilinmiyor; backend response'undan gelir.
    const stub: AttachmentItem = {
      id: attachmentId,
      scope: "MESSAGE_ATTACHMENT",
      scopeRefId: "",
      originalFilename: filename,
      mimeType: "application/octet-stream",
      fileSize: 0,
      createdAt: "",
      finalizedAt: null,
      uploadedBy: null,
    };
    downloadMutation.mutate(stub, {
      onSuccess: () => {
        // No-op — download tamamlandı.
      },
    });
    // Filename UI'da güncellenmez ama tarayıcı zaten Content-Disposition
    // header'ından doğru ismi alır (presigned GET URL'inde set'li).
    setFilename("Dosya");
  };

  const textColor = isMine ? "text-white" : "text-zinc-700";
  const hoverBg = isMine ? "hover:bg-white/10" : "hover:bg-zinc-50";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={downloadMutation.isPending}
      className={`flex items-center gap-2 w-full ${textColor} ${hoverBg} rounded-lg px-2 py-1.5 transition-colors disabled:opacity-60`}
    >
      {downloadMutation.isPending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0" />
      ) : (
        <FileText className="h-3.5 w-3.5 flex-shrink-0" />
      )}
      <span className="text-xs flex-1 text-left truncate">Dosya eki</span>
      <Download className="h-3 w-3 flex-shrink-0 opacity-60" />
    </button>
  );
}
