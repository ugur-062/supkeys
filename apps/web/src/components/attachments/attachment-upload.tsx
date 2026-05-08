"use client";

import { useUploadAttachment } from "@/hooks/use-attachments";
import type {
  AttachmentScope,
  AttachmentSurface,
} from "@/lib/attachments/types";
import { extractErrorMessage } from "@/lib/form-errors";
import { Loader2, Upload, X } from "lucide-react";
import { type DragEvent, useCallback, useRef, useState } from "react";
import { toast } from "sonner";

interface Props {
  surface: AttachmentSurface;
  scope: AttachmentScope;
  scopeRefId: string;
  onUploaded?: () => void;
  className?: string;
  hint?: string;
}

interface UploadingFile {
  id: string;
  file: File;
  progress: number;
  status: "uploading" | "success" | "error";
  error?: string;
}

const DEFAULT_HINT = "PDF, Word, Excel, görsel, ZIP — tek dosya max 50 MB";

export function AttachmentUpload({
  surface,
  scope,
  scopeRefId,
  onUploaded,
  className,
  hint,
}: Props) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [files, setFiles] = useState<UploadingFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = useUploadAttachment(surface);

  const handleFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const arr = Array.from(fileList);

      for (const file of arr) {
        const id =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random()}`;

        setFiles((prev) => [
          ...prev,
          { id, file, progress: 0, status: "uploading" },
        ]);

        try {
          await uploadMutation.mutateAsync({
            scope,
            scopeRefId,
            file,
            onProgress: (percent) => {
              setFiles((prev) =>
                prev.map((f) =>
                  f.id === id ? { ...f, progress: percent } : f,
                ),
              );
            },
          });

          setFiles((prev) =>
            prev.map((f) =>
              f.id === id ? { ...f, status: "success", progress: 100 } : f,
            ),
          );
          // 2 sn sonra listeden çıkar
          setTimeout(() => {
            setFiles((prev) => prev.filter((f) => f.id !== id));
          }, 2000);

          onUploaded?.();
          toast.success(`"${file.name}" yüklendi`);
        } catch (err) {
          const msg = extractErrorMessage(err, "Yükleme başarısız");
          setFiles((prev) =>
            prev.map((f) =>
              f.id === id ? { ...f, status: "error", error: msg } : f,
            ),
          );
          // toast.error global interceptor'da zaten çıkıyor 400/403/etc; sadece
          // R2 PUT hataları için manuel.
          if (!msg.includes("hatası") && !msg.includes("yetkiniz")) {
            // no-op — interceptor zaten gösterdi
          }
        }
      }
    },
    [scope, scopeRefId, uploadMutation, onUploaded],
  );

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        void handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles],
  );

  const onDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const onDragLeave = useCallback(() => setIsDragOver(false), []);

  const removeUploadingFile = (id: string) =>
    setFiles((prev) => prev.filter((f) => f.id !== id));

  return (
    <div className={className}>
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-6 cursor-pointer transition-all ${
          isDragOver
            ? "border-brand-500 bg-brand-50"
            : "border-slate-300 hover:border-brand-300 bg-slate-50/50"
        }`}
      >
        <div className="flex flex-col items-center text-center">
          <Upload
            className={`h-8 w-8 mb-2 ${isDragOver ? "text-brand-600" : "text-slate-400"}`}
          />
          <p className="text-sm font-semibold text-brand-900">
            Dosyayı sürükleyin veya tıklayarak seçin
          </p>
          <p className="text-xs text-slate-500 mt-1">{hint ?? DEFAULT_HINT}</p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              void handleFiles(e.target.files);
            }
            e.target.value = "";
          }}
        />
      </div>

      {files.length > 0 && (
        <div className="mt-3 space-y-2">
          {files.map((uf) => (
            <div
              key={uf.id}
              className="flex items-center gap-3 p-2 bg-white border border-slate-200 rounded-lg"
            >
              {uf.status === "uploading" && (
                <Loader2 className="h-4 w-4 text-brand-500 animate-spin flex-shrink-0" />
              )}
              {uf.status === "success" && (
                <span className="text-success-600 text-sm font-bold flex-shrink-0">
                  ✓
                </span>
              )}
              {uf.status === "error" && (
                <span className="text-danger-500 text-sm font-bold flex-shrink-0">
                  ✗
                </span>
              )}

              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate text-brand-900">
                  {uf.file.name}
                </p>
                {uf.status === "uploading" && (
                  <div className="mt-1 h-1 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-500 transition-all"
                      style={{ width: `${uf.progress}%` }}
                    />
                  </div>
                )}
                {uf.status === "error" && uf.error && (
                  <p className="text-xs text-danger-600 mt-0.5 truncate">
                    {uf.error}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => removeUploadingFile(uf.id)}
                className="p-1 hover:bg-slate-100 rounded flex-shrink-0"
                aria-label="Kaldır"
              >
                <X className="h-3 w-3 text-slate-400" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
