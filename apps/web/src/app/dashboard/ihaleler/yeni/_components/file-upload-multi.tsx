"use client";

import { cn } from "@/lib/utils";
import { AlertCircle, FileText, Upload, X } from "lucide-react";
import { useCallback, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";

export interface AttachmentValue {
  fileName: string;
  fileSize: number;
  mimeType: string;
  fileUrl: string;
}

interface FileUploadMultiProps {
  value: AttachmentValue[];
  onChange: (value: AttachmentValue[]) => void;
  maxFiles?: number;
  maxSizeMB?: number;
}

const ACCEPT: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
    ".xlsx",
  ],
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") resolve(result);
      else reject(new Error("Dosya okunamadı"));
    };
    reader.onerror = () => reject(new Error("Dosya okunamadı"));
    reader.readAsDataURL(file);
  });
}

export function FileUploadMulti({
  value,
  onChange,
  maxFiles = 10,
  maxSizeMB = 5,
}: FileUploadMultiProps) {
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(
    async (acceptedFiles: File[], rejections: FileRejection[]) => {
      setError(null);

      if (rejections.length > 0) {
        const code = rejections[0]?.errors[0]?.code;
        if (code === "file-too-large") {
          setError(`Dosya çok büyük (max ${maxSizeMB}MB)`);
        } else if (code === "file-invalid-type") {
          setError("Desteklenmeyen dosya tipi");
        } else {
          setError("Dosya yüklenemedi");
        }
        return;
      }

      const remainingSlots = maxFiles - value.length;
      if (acceptedFiles.length > remainingSlots) {
        setError(`En fazla ${maxFiles} dosya yükleyebilirsiniz`);
        return;
      }

      try {
        const newAttachments: AttachmentValue[] = await Promise.all(
          acceptedFiles.map(async (file) => ({
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type || "application/octet-stream",
            fileUrl: await readAsDataUrl(file),
          })),
        );
        onChange([...value, ...newAttachments]);
      } catch {
        setError("Bir veya daha fazla dosya okunamadı");
      }
    },
    [maxFiles, maxSizeMB, onChange, value],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPT,
    maxSize: maxSizeMB * 1024 * 1024,
    multiple: true,
  });

  const handleRemove = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-3">
      {value.length < maxFiles ? (
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
            PDF, DOC, XLS, JPG, PNG · max {maxSizeMB}MB · {value.length}/
            {maxFiles}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
          Maksimum dosya sayısına ulaştınız ({maxFiles}).
        </div>
      )}

      {error ? (
        <p className="text-xs text-danger-600 flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5" /> {error}
        </p>
      ) : null}

      {value.length > 0 ? (
        <ul className="space-y-2">
          {value.map((file, idx) => (
            <li
              key={`${file.fileName}-${idx}`}
              className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-white"
            >
              <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
                <FileText className="w-4 h-4 text-brand-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-brand-900 truncate">
                  {file.fileName}
                </p>
                <p className="text-xs text-slate-500">
                  {formatBytes(file.fileSize)}
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
