"use client";

import {
  useCompanyDocs,
  useUploadCompanyDoc,
  type DocsSurface,
} from "@/hooks/use-company-docs";
import { Check, ExternalLink, Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

const DOC_LABELS: Record<string, string> = {
  TAX_PLATE: "Vergi Levhası",
  TRADE_REGISTRY: "Ticaret Sicil Gazetesi",
  SIGNATURE_CIRCULAR: "İmza Sirküleri",
  ACTIVITY_CERT: "Faaliyet Belgesi",
  ID_FRONT: "Yetkili Kimlik Belgesi - Ön Yüz",
  ID_BACK: "Yetkili Kimlik Belgesi - Arka Yüz",
};

const ORDER = [
  "TAX_PLATE",
  "TRADE_REGISTRY",
  "SIGNATURE_CIRCULAR",
  "ACTIVITY_CERT",
  "ID_FRONT",
  "ID_BACK",
];

const ACCEPT = "application/pdf,image/jpeg,image/png";
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export function CompanyDocsSection({ surface }: { surface: DocsSurface }) {
  const docs = useCompanyDocs(surface);
  const upload = useUploadCompanyDoc(surface);
  const [activeType, setActiveType] = useState<string | null>(null);

  const byType = new Map(
    (docs.data?.docs ?? []).map((d) => [d.docType, d] as const),
  );
  const uploadedCount = docs.data?.docs.filter((d) => d.uploaded).length ?? 0;

  const handleFile = (docType: string, file: File) => {
    if (file.size > MAX_BYTES) {
      toast.error("Dosya 10 MB'tan büyük olamaz");
      return;
    }
    setActiveType(docType);
    upload.mutate(
      { docType, file },
      {
        onSuccess: () => toast.success("Belge yüklendi"),
        onError: () => toast.error("Yüklenemedi, lütfen tekrar deneyin"),
        onSettled: () => setActiveType(null),
      },
    );
  };

  return (
    <section className="rounded-2xl border border-zinc-950/10 bg-white p-6">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-base font-semibold text-zinc-900">
          Doğrulama Belgeleri
        </h2>
        <span className="text-sm font-semibold text-zinc-500">
          {uploadedCount}/6
        </span>
      </div>
      <p className="mb-4 text-xs text-zinc-500">
        Zorunlu belgelerin tamamını yükleyerek doğrulama sürecini başlatın.
        (PDF, JPG, PNG — max 10 MB)
      </p>

      {docs.isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
        </div>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {ORDER.map((docType) => {
            const d = byType.get(docType);
            const uploaded = !!d?.uploaded;
            const busy = upload.isPending && activeType === docType;
            return (
              <li
                key={docType}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                      uploaded
                        ? "bg-success-100 text-success-700"
                        : "bg-zinc-100 text-zinc-400"
                    }`}
                  >
                    {uploaded ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-900">
                      {DOC_LABELS[docType] ?? docType}
                    </p>
                    {!uploaded ? (
                      <span className="text-[11px] font-semibold uppercase text-rose-600">
                        Zorunlu
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {uploaded && d?.url ? (
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-600 hover:text-zinc-900"
                    >
                      Görüntüle
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : null}
                  <UploadButton
                    label={uploaded ? "Değiştir" : "Yükle"}
                    busy={busy}
                    onPick={(file) => handleFile(docType, file)}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function UploadButton({
  label,
  busy,
  onPick,
}: {
  label: string;
  busy: boolean;
  onPick: (file: File) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        {label}
      </button>
    </>
  );
}
