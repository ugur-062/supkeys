"use client";

import { cn } from "@/lib/utils";
import { ArrowUpTrayIcon } from "@heroicons/react/24/outline";
import { useRef, useState } from "react";

interface DropzoneProps {
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  label?: string;
  hint?: string;
  className?: string;
}

/**
 * Tailwind Plus "form-layouts" dropzone deseninin Catalyst/zinc uyarlaması —
 * sürükle-bırak + tıkla-seç. Tüm dosya yükleme alanlarında kullanılır.
 */
export function Dropzone({
  accept,
  multiple = false,
  disabled = false,
  onFiles,
  label = "Dosya seç",
  hint,
  className,
}: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const pick = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    onFiles(Array.from(list));
  };

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => {
        if (!disabled && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled) pick(e.dataTransfer.files);
      }}
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-8 text-center transition-colors",
        over
          ? "border-zinc-900 bg-zinc-50"
          : "border-zinc-950/25 hover:border-zinc-400",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        className,
      )}
    >
      <ArrowUpTrayIcon aria-hidden="true" className="size-8 text-zinc-300" />
      <div className="mt-3 text-sm text-zinc-600">
        <span className="font-semibold text-zinc-900">{label}</span>
        <span> veya sürükle-bırak</span>
      </div>
      {hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        onChange={(e) => {
          pick(e.target.files);
          if (inputRef.current) inputRef.current.value = "";
        }}
      />
    </div>
  );
}
