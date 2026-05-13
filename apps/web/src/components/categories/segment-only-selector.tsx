"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Tag } from "lucide-react";
import { useRoots } from "@/hooks/use-categories";

interface Props {
  value: string[];
  onChange: (ids: string[]) => void;
  maxSelection?: number;
  error?: string;
  disabled?: boolean;
}

/**
 * V2-6 — Tedarikçi kategori seçici. SADECE Level 1 (Segment) gösterilir;
 * Family/Class/Commodity yok. Inline (modal değil), checkbox tarzı liste,
 * multi-select max N. Tender wizard 4-seviye modal'ı bağımsız kalır.
 */
export function SegmentOnlySelector({
  value,
  onChange,
  maxSelection = 10,
  error,
  disabled,
}: Props) {
  const { data: segments, isLoading } = useRoots();
  const [warningMsg, setWarningMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!warningMsg) return;
    const t = setTimeout(() => setWarningMsg(null), 3000);
    return () => clearTimeout(t);
  }, [warningMsg]);

  const toggle = (id: string) => {
    if (disabled) return;
    if (value.includes(id)) {
      onChange(value.filter((x) => x !== id));
      return;
    }
    if (value.length >= maxSelection) {
      setWarningMsg(`En fazla ${maxSelection} kategori seçebilirsiniz`);
      return;
    }
    onChange([...value, id]);
  };

  const clearAll = () => onChange([]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white p-12">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div
      className={`overflow-hidden rounded-2xl border-2 bg-white ${
        error ? "border-rose-300" : "border-slate-200"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
        <span className="text-sm font-semibold text-brand-900">
          {value.length} kategori seçildi (max {maxSelection})
        </span>
        {value.length > 0 && !disabled ? (
          <button
            type="button"
            onClick={clearAll}
            className="text-xs font-semibold text-brand-600 hover:text-brand-700"
          >
            Tümünü Temizle
          </button>
        ) : null}
      </div>

      {warningMsg ? (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700">
          ⚠️ {warningMsg}
        </div>
      ) : null}

      {/* Segment list */}
      <ul className="divide-y divide-slate-100">
        {(segments ?? []).map((segment) => {
          const isSelected = value.includes(segment.id);
          return (
            <li key={segment.id}>
              <button
                type="button"
                onClick={() => toggle(segment.id)}
                disabled={disabled}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                  isSelected
                    ? "bg-brand-50 hover:bg-brand-100"
                    : "hover:bg-slate-50"
                }`}
              >
                <div
                  className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 ${
                    isSelected
                      ? "border-brand-500 bg-brand-500"
                      : "border-slate-300 bg-white"
                  }`}
                >
                  {isSelected ? (
                    <Check className="h-3.5 w-3.5 text-white" />
                  ) : null}
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    {segment.segmentLetter ? (
                      <span
                        className={`font-mono text-xs ${
                          isSelected ? "text-brand-600" : "text-slate-400"
                        }`}
                      >
                        {segment.segmentLetter}.
                      </span>
                    ) : null}
                    <span
                      className={`text-sm ${
                        isSelected
                          ? "font-semibold text-brand-900"
                          : "text-slate-700"
                      }`}
                    >
                      {segment.nameTr}
                    </span>
                  </div>
                </div>

                <Tag
                  className={`h-4 w-4 flex-shrink-0 ${
                    isSelected ? "text-brand-600" : "text-slate-300"
                  }`}
                />
              </button>
            </li>
          );
        })}
      </ul>

      {error ? (
        <div className="border-t border-rose-200 bg-rose-50 px-4 py-2">
          <p className="text-xs text-rose-600">{error}</p>
        </div>
      ) : null}
    </div>
  );
}
