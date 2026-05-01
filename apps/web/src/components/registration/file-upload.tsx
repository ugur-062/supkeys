"use client";

import { cn } from "@/lib/utils";
import { AlertCircle, FileText, Upload, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";

interface FileUploadProps {
  value: string | null;
  onChange: (value: string | null) => void;
  accept?: Record<string, string[]>;
  maxSizeMB?: number;
  hasError?: boolean;
  errorMessage?: string;
  /**
   * Davet üzerinden gelinen formlarda dosya zaten yüklenmiş gibi gözüksün diye
   * önceden doldurulmuş başlık (varsa). Şimdilik kullanılmıyor.
   */
  initialFileName?: string;
}

const DEFAULT_ACCEPT: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileUpload({
  value,
  onChange,
  accept = DEFAULT_ACCEPT,
  maxSizeMB = 10,
  hasError,
  errorMessage,
  initialFileName,
}: FileUploadProps) {
  const [fileName, setFileName] = useState<string | null>(
    initialFileName ?? null,
  );
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  // value dışarıdan temizlendiyse iç state'i de sıfırla
  useEffect(() => {
    if (!value) {
      setFileName(null);
      setFileSize(null);
    }
  }, [value]);

  const onDrop = useCallback(
    (acceptedFiles: File[], fileRejections: FileRejection[]) => {
      setLocalError(null);

      if (fileRejections.length > 0) {
        const code = fileRejections[0]?.errors[0]?.code;
        if (code === "file-too-large") {
          setLocalError(`Dosya çok büyük (max ${maxSizeMB}MB)`);
        } else if (code === "file-invalid-type") {
          setLocalError("Desteklenmeyen dosya tipi (PDF, JPG, PNG)");
        } else {
          setLocalError("Dosya yüklenemedi");
        }
        return;
      }

      const file = acceptedFiles[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result === "string") {
          onChange(result);
          setFileName(file.name);
          setFileSize(file.size);
        }
      };
      reader.onerror = () => setLocalError("Dosya okunamadı");
      reader.readAsDataURL(file);
    },
    [maxSizeMB, onChange],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
    maxSize: maxSizeMB * 1024 * 1024,
    multiple: false,
  });

  const showError = hasError || !!localError;
  const errorMsg = localError ?? errorMessage;

  if (value && fileName) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-3 p-4 rounded-xl border border-success-500 bg-success-50/30">
          <div className="w-10 h-10 rounded-lg bg-success-50 flex items-center justify-center flex-shrink-0">
            <FileText className="w-5 h-5 text-success-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-brand-900 truncate">
              {fileName}
            </p>
            {fileSize ? (
              <p className="text-xs text-slate-500">{formatBytes(fileSize)}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setFileName(null);
              setFileSize(null);
            }}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-danger-600 hover:bg-danger-50 transition-colors"
            aria-label="Dosyayı kaldır"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed rounded-xl p-8 cursor-pointer transition-colors",
          "flex flex-col items-center justify-center text-center gap-2",
          isDragActive && "bg-brand-50 border-brand-500",
          !isDragActive && !showError && "border-slate-300 hover:border-brand-400 hover:bg-brand-50/40",
          showError && "border-danger-500 bg-danger-50/30",
        )}
      >
        <input {...getInputProps()} />
        <div
          className={cn(
            "w-12 h-12 rounded-full flex items-center justify-center",
            showError ? "bg-danger-50" : "bg-brand-50",
          )}
        >
          {showError ? (
            <AlertCircle className="w-6 h-6 text-danger-600" />
          ) : (
            <Upload className="w-6 h-6 text-brand-600" />
          )}
        </div>
        <p className="text-sm font-medium text-brand-900">
          {isDragActive
            ? "Dosyayı bırakın"
            : "Vergi levhanızı buraya sürükleyin veya seçin"}
        </p>
        <p className="text-xs text-slate-500">
          PDF, JPG, PNG (max {maxSizeMB}MB)
        </p>
      </div>
      {errorMsg ? (
        <p className="text-xs text-danger-600 flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5" /> {errorMsg}
        </p>
      ) : null}
    </div>
  );
}
