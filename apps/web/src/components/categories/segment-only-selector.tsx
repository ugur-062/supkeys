"use client";

import { Input, InputGroup } from "@/components/catalyst/input";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useRoots } from "@/hooks/use-categories";
import { MagnifyingGlassIcon } from "@heroicons/react/16/solid";
import { Check, ChevronDown, Loader2, Tag, X as XIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

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
              ? "border-zinc-500"
              : "border-zinc-200 hover:border-zinc-300"
        }`}
      >
        <Tag
          className={`h-4 w-4 flex-shrink-0 ${
            value.length > 0 ? "text-zinc-600" : "text-zinc-400"
          }`}
        />

        <div className="flex flex-1 flex-wrap items-center gap-1.5">
          {selectedSegments.length === 0 ? (
            <span className="text-sm text-zinc-500">{placeholder}</span>
          ) : (
            selectedSegments.map((seg) => (
              <span
                key={seg.id}
                className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-xs font-semibold text-zinc-700"
                title={seg.nameTr}
              >
                {seg.segmentLetter ? (
                  <span className="font-mono text-zinc-500">
                    {seg.segmentLetter}.
                  </span>
                ) : null}
                <span className="max-w-[180px] truncate">{seg.nameTr}</span>
                {!disabled ? (
                  <button
                    type="button"
                    onClick={(e) => removeChip(seg.id, e)}
                    className="ml-0.5 rounded p-0.5 hover:bg-zinc-100 hover:text-rose-600"
                    aria-label={`${seg.nameTr} kaldır`}
                  >
                    <XIcon className="h-3 w-3" />
                  </button>
                ) : null}
              </span>
            ))
          )}
        </div>

        <span className="flex flex-shrink-0 items-center gap-2 text-xs text-zinc-500">
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
        <div className="absolute left-0 right-0 z-30 mt-2 overflow-hidden rounded-xl ring-1 ring-zinc-950/5 bg-white shadow-lg">
          {/* Search */}
          <div className="border-b border-zinc-950/5 bg-zinc-50/60 p-2">
            <InputGroup>
              <MagnifyingGlassIcon data-slot="icon" />
              <Input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Kategori ara..."
              />
            </InputGroup>
            {warningMsg ? (
              <Alert variant="warning" className="mt-2 p-2 text-xs">
                {warningMsg}
              </Alert>
            ) : null}
          </div>

          {/* Options list */}
          <div className="max-h-72 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
              </div>
            ) : filteredSegments.length === 0 ? (
              <div className="py-8 text-center text-sm text-zinc-500">
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
                            ? "bg-zinc-50 hover:bg-zinc-100"
                            : "hover:bg-zinc-50"
                        }`}
                      >
                        <div
                          className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 ${
                            isSelected
                              ? "border-zinc-500 bg-zinc-500"
                              : "border-zinc-300 bg-white"
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
                                isSelected ? "text-zinc-600" : "text-zinc-400"
                              }`}
                            >
                              {segment.segmentLetter}.
                            </span>
                          ) : null}
                          <span
                            className={`text-sm ${
                              isSelected
                                ? "font-semibold text-zinc-900"
                                : "text-zinc-700"
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
          <div className="flex items-center justify-between border-t border-zinc-950/5 bg-zinc-50 px-3 py-2 text-xs">
            <span className="text-zinc-600">
              {value.length}/{maxSelection} kategori seçildi
            </span>
            <div className="flex items-center gap-2">
              {value.length > 0 && !disabled ? (
                <Button variant="ghost" size="sm" onClick={() => onChange([])}>
                  Temizle
                </Button>
              ) : null}
              <Button size="sm" onClick={() => setOpen(false)}>
                Tamam
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
