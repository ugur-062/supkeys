"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Loader2,
  Search,
  Tag,
  X as XIcon,
} from "lucide-react";
import { useRoots } from "@/hooks/use-categories";

interface Props {
  value: string[];
  onChange: (ids: string[]) => void;
  maxSelection?: number;
  error?: string;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * V2-6 — Tedarikçi kategori seçici (Segment level 1 only).
 * Combobox tarzı dropdown: trigger üstte chip listesi + "Ekle" ipucu, popover
 * altında scrollable arama + checkbox listesi. Inline 56 satır yerine
 * kompakt + şık görünüm.
 */
export function SegmentOnlySelector({
  value,
  onChange,
  maxSelection = 10,
  error,
  disabled,
  placeholder = "Faaliyet alanlarınızı seçin",
}: Props) {
  const { data: segments, isLoading } = useRoots();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [warningMsg, setWarningMsg] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Outside click + ESC closes the popover
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    // Autofocus search
    queueMicrotask(() => searchRef.current?.focus());
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!warningMsg) return;
    const t = setTimeout(() => setWarningMsg(null), 2500);
    return () => clearTimeout(t);
  }, [warningMsg]);

  const selectedSegments = useMemo(
    () => (segments ?? []).filter((s) => value.includes(s.id)),
    [segments, value],
  );

  const filteredSegments = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr-TR");
    if (!q) return segments ?? [];
    return (segments ?? []).filter((s) =>
      s.nameTr.toLocaleLowerCase("tr-TR").includes(q),
    );
  }, [segments, search]);

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

  const removeChip = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    onChange(value.filter((x) => x !== id));
  };

  return (
    <div className="relative" ref={rootRef}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex min-h-[52px] w-full items-center gap-2 rounded-xl border-2 bg-white px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
          error
            ? "border-rose-300"
            : open
              ? "border-brand-500"
              : "border-slate-200 hover:border-slate-300"
        }`}
      >
        <Tag
          className={`h-4 w-4 flex-shrink-0 ${
            value.length > 0 ? "text-brand-600" : "text-slate-400"
          }`}
        />

        <div className="flex flex-1 flex-wrap items-center gap-1.5">
          {selectedSegments.length === 0 ? (
            <span className="text-sm text-slate-500">{placeholder}</span>
          ) : (
            selectedSegments.map((seg) => (
              <span
                key={seg.id}
                className="inline-flex items-center gap-1 rounded-md border border-brand-200 bg-brand-50 px-1.5 py-0.5 text-xs font-semibold text-brand-700"
                title={seg.nameTr}
              >
                {seg.segmentLetter ? (
                  <span className="font-mono text-brand-500">
                    {seg.segmentLetter}.
                  </span>
                ) : null}
                <span className="max-w-[180px] truncate">{seg.nameTr}</span>
                {!disabled ? (
                  <button
                    type="button"
                    onClick={(e) => removeChip(seg.id, e)}
                    className="ml-0.5 rounded p-0.5 hover:bg-brand-100 hover:text-rose-600"
                    aria-label={`${seg.nameTr} kaldır`}
                  >
                    <XIcon className="h-3 w-3" />
                  </button>
                ) : null}
              </span>
            ))
          )}
        </div>

        <span className="flex flex-shrink-0 items-center gap-2 text-xs text-slate-500">
          <span>
            {value.length}/{maxSelection}
          </span>
          <ChevronDown
            className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>

      {/* Inline error */}
      {error ? (
        <p className="mt-1.5 text-xs text-rose-600">{error}</p>
      ) : null}

      {/* Dropdown panel */}
      {open ? (
        <div className="absolute left-0 right-0 z-30 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          {/* Search */}
          <div className="border-b border-slate-100 bg-slate-50/60 p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Kategori ara..."
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            {warningMsg ? (
              <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-700">
                ⚠️ {warningMsg}
              </div>
            ) : null}
          </div>

          {/* Options list */}
          <div className="max-h-72 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            ) : filteredSegments.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-500">
                Sonuç bulunamadı
              </div>
            ) : (
              <ul role="listbox">
                {filteredSegments.map((segment) => {
                  const isSelected = value.includes(segment.id);
                  return (
                    <li key={segment.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => toggle(segment.id)}
                        className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
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

                        <div className="flex flex-1 items-center gap-2">
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
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-3 py-2 text-xs">
            <span className="text-slate-600">
              {value.length}/{maxSelection} kategori seçildi
            </span>
            <div className="flex items-center gap-2">
              {value.length > 0 && !disabled ? (
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="font-semibold text-slate-500 hover:text-rose-600"
                >
                  Temizle
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600"
              >
                Tamam
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
