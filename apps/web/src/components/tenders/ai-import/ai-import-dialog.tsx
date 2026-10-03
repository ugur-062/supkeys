"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/catalyst/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Dropzone } from "@/components/ui/dropzone";
import { useAiTenderExtract } from "@/hooks/use-ai-tender-import";
import { extractErrorMessage } from "@/lib/tenders/error";
import type { AiTenderExtractResult } from "@rothern/shared";
import { FileText, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Faz AI-1 — "Belgeden Doldur (AI)": PDF/fotoğraf yükle → AI formu doldurur →
 * wizard işaretli alanlarla açılır. AI ihale AÇMAZ; karar kullanıcınındır.
 */
export function AiImportDialog({
  open,
  onClose,
  onResult,
}: {
  open: boolean;
  onClose: () => void;
  onResult: (result: AiTenderExtractResult) => void;
}) {
  const t = useTranslations("web.panel.requests.aiImportDialog");
  const [files, setFiles] = useState<File[]>([]);
  const extract = useAiTenderExtract();
  const busy = extract.isPending;

  const addFiles = (incoming: File[]) => {
    // Tek PDF / tek Excel ya da çoklu fotoğraf — karışık seçim backend'de de reddedilir.
    const merged = [...files, ...incoming].slice(0, 20);
    setFiles(merged);
  };

  const run = async () => {
    try {
      const result = await extract.mutateAsync({ files });
      setFiles([]);
      onResult(result);
    } catch (err) {
      toast.error(extractErrorMessage(err, t("belgeIslenemedi")));
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      size="lg"
    >
      <DialogTitle>
        <span className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          {t("belgedenDoldurAi")}
        </span>
      </DialogTitle>
      <DialogDescription>
        {t("sartnameTeklifTalebiSiparisListesi")}
      </DialogDescription>
      <DialogBody className="space-y-4">
        <Dropzone
          accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.xlsx,.csv"
          multiple
          disabled={busy}
          onFiles={addFiles}
          label={t("pdfFotografVeyaExcelSec")}
          hint={t("tekPdfTekExcelCsv")}
        />
        {files.length > 0 ? (
          <ul className="space-y-1">
            {files.map((f, i) => (
              <li
                key={`${f.name}-${i}`}
                className="flex items-center gap-2 rounded-lg border border-zinc-950/10 px-3 py-1.5 text-sm text-zinc-700"
              >
                <FileText className="h-4 w-4 shrink-0 text-zinc-400" />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <span className="text-xs text-zinc-400">
                  {t("mb", { toFixed: (f.size / 1024 / 1024).toFixed(1) })}
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setFiles(files.filter((_, j) => j !== i))}
                  aria-label={t("kaldir", { name: f.name })}
                  className="text-zinc-400 hover:text-zinc-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {busy ? (
          <p className="text-sm text-zinc-500">
            {t("belgeIsleniyorAiFormuDolduruyor")}
          </p>
        ) : null}
      </DialogBody>
      <DialogActions>
        <Button plain disabled={busy} onClick={onClose}>
          {t("vazgec")}
        </Button>
        <Button disabled={busy || files.length === 0} onClick={() => void run()}>
          {busy ? t("isleniyor") : t("formuDoldur")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
