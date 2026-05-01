"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import * as Dialog from "@radix-ui/react-dialog";
import { Download, FileWarning, X } from "lucide-react";
import { useMemo } from "react";

interface TaxCertModalProps {
  /** data:application/pdf;base64,... veya data:image/jpeg;base64,... */
  taxCertUrl: string | null;
  companyName: string;
  open: boolean;
  onClose: () => void;
}

interface ParsedCert {
  mimeType: string | null;
  isPdf: boolean;
  isImage: boolean;
  isData: boolean;
}

function parseCert(value: string | null): ParsedCert {
  if (!value) {
    return { mimeType: null, isPdf: false, isImage: false, isData: false };
  }
  const match = value.match(/^data:([^;]+);base64,/);
  const mimeType = match?.[1] ?? null;
  return {
    mimeType,
    isPdf: mimeType === "application/pdf",
    isImage: mimeType?.startsWith("image/") ?? false,
    isData: value.startsWith("data:"),
  };
}

function suggestedFilename(companyName: string, mime: string | null): string {
  const safe = companyName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    || "vergi-levhasi";
  const ext = mime === "application/pdf"
    ? "pdf"
    : mime === "image/jpeg"
      ? "jpg"
      : mime === "image/png"
        ? "png"
        : "bin";
  return `${safe}-vergi-levhasi.${ext}`;
}

export function TaxCertModal({
  taxCertUrl,
  companyName,
  open,
  onClose,
}: TaxCertModalProps) {
  // Büyük base64 stringi sadece modal açıkken parse et
  const cert = useMemo(
    () => (open ? parseCert(taxCertUrl) : null),
    [open, taxCertUrl],
  );

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-900/70 z-[60]" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[60]",
            "w-full max-w-4xl bg-white rounded-2xl shadow-2xl outline-none flex flex-col",
            "max-h-[90vh]",
          )}
        >
          <header className="px-5 py-4 border-b border-admin-border flex items-start justify-between gap-3 shrink-0">
            <div className="min-w-0">
              <Dialog.Title className="font-display font-bold text-lg text-admin-text truncate">
                Vergi Levhası — {companyName}
              </Dialog.Title>
              {cert?.mimeType && (
                <Dialog.Description className="text-xs text-admin-text-muted mt-0.5">
                  {cert.mimeType}
                </Dialog.Description>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {taxCertUrl && cert?.isData && (
                <a
                  href={taxCertUrl}
                  download={suggestedFilename(companyName, cert.mimeType)}
                  className="inline-flex"
                >
                  <Button type="button" variant="secondary" size="sm">
                    <Download className="w-4 h-4" />
                    İndir
                  </Button>
                </a>
              )}
              <Dialog.Close asChild>
                <button
                  aria-label="Kapat"
                  className="p-1.5 rounded-lg hover:bg-surface-muted text-admin-text-muted hover:text-admin-text transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </Dialog.Close>
            </div>
          </header>

          <div className="flex-1 overflow-auto bg-slate-50">
            {!taxCertUrl || !cert?.isData ? (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center text-admin-text-muted">
                <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center mb-3">
                  <FileWarning className="w-6 h-6" />
                </div>
                <p className="text-sm">Vergi levhası görüntülenemiyor.</p>
              </div>
            ) : cert.isPdf ? (
              <iframe
                src={taxCertUrl}
                title={`Vergi levhası — ${companyName}`}
                className="w-full h-[75vh] bg-white"
              />
            ) : cert.isImage ? (
              <div className="flex items-center justify-center p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={taxCertUrl}
                  alt={`Vergi levhası — ${companyName}`}
                  className="max-w-full max-h-[75vh] object-contain rounded shadow"
                />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <p className="text-sm text-admin-text-muted mb-4">
                  Bu format tarayıcıda görüntülenemiyor. Yine de indirebilirsiniz.
                </p>
                <a
                  href={taxCertUrl}
                  download={suggestedFilename(companyName, cert.mimeType)}
                >
                  <Button type="button">
                    <Download className="w-4 h-4" />
                    İndir
                  </Button>
                </a>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
