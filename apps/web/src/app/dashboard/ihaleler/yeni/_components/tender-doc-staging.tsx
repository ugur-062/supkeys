"use client";

import { cn } from "@/lib/utils";
import { AlertCircle, FileText, Upload, X } from "lucide-react";
import { useCallback, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";

/**
 * V2-2 — Tender wizard'ında dosyalar wizard state'inde `File[]` olarak
 * stage edilir. Tender create edildikten sonra `useUploadAttachment` ile
 * paralel R2'ye yüklenir. Bu component sadece browser'da seçim + listeleme
 * yapar; backend'e hiç dokunmaz.
 */

const ACCEPT: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/gif": [".gif"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
    ".xlsx",
  ],
  "application/vnd.ms-powerpoint": [".ppt"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [
    ".pptx",
  ],
  "application/zip": [".zip"],
  "text/plain": [".txt"],
  "text/csv": [".csv"],
};

const MAX_FILES = 10;
const MAX_SIZE_MB = 50;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Props {
  files: File[];
  onChange: (files: File[]) => void;
}

export function TenderDocStaging({ files, onChange }: Props) {
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(
    (acceptedFiles: File[], rejections: FileRejection[]) => {
      setError(null);

      if (rejections.length > 0) {
        const code = rejections[0]?.errors[0]?.code;
        if (code === "file-too-large") {
          setError(`Dosya çok büyük (max ${MAX_SIZE_MB} MB)`);
        } else if (code === "file-invalid-type") {
          setError("Desteklenmeyen dosya tipi");
        } else {
          setError("Dosya eklenemedi");
        }
        return;
      }

      const remaining = MAX_FILES - files.length;
      if (acceptedFiles.length > remaining) {
        setError(`En fazla ${MAX_FILES} dosya ekleyebilirsiniz`);
        return;
      }

      onChange([...files, ...acceptedFiles]);
    },
    [files, onChange],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPT,
    maxSize: MAX_SIZE_MB * 1024 * 1024,
    multiple: true,
  });

  const handleRemove = (idx: number) => {
    onChange(files.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-3">
      {files.length < MAX_FILES ? (
        <div
          {...getRootProps()}
          className={cn(
            "border-2 border-dashed rounded-xl p-6 cursor-pointer transition-colors",
            "flex flex-col items-center justify-center text-center gap-2",
            isDragActive
              ? "bg-brand-50 border-brand-500"
              : "border-slate-300 hover:border-brand-400 hover:bg-brand-50/40",
          )}
        >
          <input {...getInputProps()} />
          <div className="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center">
            <Upload className="w-5 h-5 text-brand-600" />
          </div>
          <p className="text-sm font-medium text-brand-900">
            {isDragActive
              ? "Dosyaları bırakın"
              : "Dosya sürükleyin veya tıklayın"}
          </p>
          <p className="text-xs text-slate-500">
            PDF, Word, Excel, PowerPoint, görsel, ZIP · max {MAX_SIZE_MB} MB ·{" "}
            {files.length}/{MAX_FILES}
          </p>
          <p className="text-[11px] text-slate-400">
            Yayınladığınızda otomatik yüklenir.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
          Maksimum dosya sayısına ulaştınız ({MAX_FILES}).
        </div>
      )}

      {error ? (
        <p className="text-xs text-danger-600 flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5" /> {error}
        </p>
      ) : null}

      {files.length > 0 ? (
        <ul className="space-y-2">
          {files.map((file, idx) => (
            <li
              key={`${file.name}-${idx}`}
              className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-white"
            >
              <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
                <FileText className="w-4 h-4 text-brand-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-brand-900 truncate">
                  {file.name}
                </p>
                <p className="text-xs text-slate-500">
                  {formatBytes(file.size)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(idx)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-danger-600 hover:bg-danger-50 transition-colors"
                aria-label="Dosyayı kaldır"
              >
                <X className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
