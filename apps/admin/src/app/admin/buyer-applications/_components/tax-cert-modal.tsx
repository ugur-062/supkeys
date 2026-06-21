"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
  Description as DialogDescription,
} from "@headlessui/react";
import { Download, FileWarning, X } from "lucide-react";
import { useMemo } from "react";

interface TaxCertModalProps {
  /** data:application/pdf;base64,... veya data:image/jpeg;base64,... */
  taxCertUrl: string | null;
  companyName: string;
  open: boolean;
  onClose: () => void;
  /** Belge etiketi (başlık + indirme dosya adı). Varsayılan: "Vergi Levhası". */
  docLabel?: string;
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

function slugify(value: string, fallback: string): string {
  return (
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || fallback
  );
}

function suggestedFilename(
  companyName: string,
  mime: string | null,
  docLabel: string,
): string {
  const safe = slugify(companyName, "firma");
  const docSlug = slugify(docLabel, "belge");
  const ext = mime === "application/pdf"
    ? "pdf"
    : mime === "image/jpeg"
      ? "jpg"
      : mime === "image/png"
        ? "png"
        : "bin";
  return `${safe}-${docSlug}.${ext}`;
}

export function TaxCertModal({
  taxCertUrl,
  companyName,
  open,
  onClose,
  docLabel = "Vergi Levhası",
}: TaxCertModalProps) {
  // Büyük base64 stringi sadece modal açıkken parse et
  const cert = useMemo(
    () => (open ? parseCert(taxCertUrl) : null),
    [open, taxCertUrl],
  );

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-zinc-950/50 backdrop-blur-sm transition-opacity duration-200 data-closed:opacity-0"
      />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel
          transition
          className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl outline-none ring-1 ring-zinc-950/10 transition duration-200 data-closed:scale-95 data-closed:opacity-0"
        >
          <header className="px-5 py-4 border-b border-admin-border flex items-start justify-between gap-3 shrink-0">
            <div className="min-w-0">
              <DialogTitle className="font-display font-bold text-lg text-admin-text truncate">
                {docLabel} — {companyName}
              </DialogTitle>
              {cert?.mimeType && (
                <DialogDescription className="text-xs text-admin-text-muted mt-0.5">
                  {cert.mimeType}
                </DialogDescription>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {taxCertUrl && cert?.isData && (
                <a
                  href={taxCertUrl}
                  download={suggestedFilename(
                    companyName,
                    cert.mimeType,
                    docLabel,
                  )}
                  className="inline-flex"
                >
                  <Button type="button" variant="secondary" size="sm">
                    <Download className="w-4 h-4" />
                    İndir
                  </Button>
                </a>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="Kapat"
                className="p-1.5 rounded-lg hover:bg-surface-muted text-admin-text-muted hover:text-admin-text transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-auto bg-zinc-50">
            {!taxCertUrl || !cert?.isData ? (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center text-admin-text-muted">
                <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center mb-3">
                  <FileWarning className="w-6 h-6" />
                </div>
                <p className="text-sm">{docLabel} görüntülenemiyor.</p>
              </div>
            ) : cert.isPdf ? (
              <iframe
                src={taxCertUrl}
                title={`${docLabel} — ${companyName}`}
                className="w-full h-[75vh] bg-white"
              />
            ) : cert.isImage ? (
              <div className="flex items-center justify-center p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={taxCertUrl}
                  alt={`${docLabel} — ${companyName}`}
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
                  download={suggestedFilename(
                    companyName,
                    cert.mimeType,
                    docLabel,
                  )}
                >
                  <Button type="button">
                    <Download className="w-4 h-4" />
                    İndir
                  </Button>
                </a>
              </div>
            )}
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
