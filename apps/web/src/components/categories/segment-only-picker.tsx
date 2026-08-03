"use client";

import { foldSearchText } from "@rothern/shared";
import { Input, InputGroup } from "@/components/catalyst/input";
import { Button } from "@/components/ui/button";
import { useRoots } from "@/hooks/use-categories";
import { MagnifyingGlassIcon } from "@heroicons/react/16/solid";
import { Check, ChevronRight, Loader2, Plus, Tag, X as XIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

interface Props {
  value: string[];
  onChange: (ids: string[]) => void;
  maxSelection?: number;
  error?: string;
  disabled?: boolean;
  placeholder?: string;
  title?: string;
  description?: string;
}

/**
 * V2-6 — Tedarikçi kategori seçici, modal popup. Sadece Level 1 (Segment).
 * Trigger boş ise dashed CTA, dolu ise chip listesi + "Düzenle". Click → modal
 * (full-screen overlay) açılır; içerde search + checkbox listesi + footer.
 * Draft state pattern — sadece "Onayla" parent onChange'i tetikler.
 */
export function SegmentOnlyPicker({
  value,
  onChange,
  maxSelection = 10,
  error,
  disabled,
  placeholder = "Faaliyet alanlarınızı seçin",
  title = "Faaliyet Alanlarınız",
  description = "Tedarik edebileceğiniz ana kategorileri seçin. Birden fazla kategori seçebilirsiniz; bu seçim alıcılara önerilirken kullanılır.",
}: Props) {
  const [open, setOpen] = useState(false);
  const { data: segments } = useRoots();

  const selectedSegments = useMemo(
    () => (segments ?? []).filter((s) => value.includes(s.id)),
    [segments, value],
  );

  return (
    <>
      {value.length === 0 ? (
        <button
          type="button"
          onClick={() => !disabled && setOpen(true)}
          disabled={disabled}
          className={`flex w-full items-center justify-between rounded-lg border-2 border-dashed px-4 py-3 transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
            error
              ? "border-rose-300 bg-rose-50 hover:bg-rose-100"
              : "border-slate-300 bg-white hover:border-zinc-400 hover:bg-zinc-50/30"
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                error ? "bg-rose-100" : "bg-slate-100"
              }`}
            >
              <Tag
                className={`h-4 w-4 ${
                  error ? "text-rose-600" : "text-slate-500"
                }`}
              />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-zinc-900">
                {placeholder}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                En fazla {maxSelection} kategori seçebilirsiniz
              </p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-400" />
        </button>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            {selectedSegments.map((seg) => (
              <span
                key={seg.id}
                className="inline-flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700"
                title={seg.nameTr}
              >
                <Tag className="h-3 w-3" />
                {seg.segmentLetter ? (
                  <span className="font-mono text-zinc-500">
                    {seg.segmentLetter}.
                  </span>
                ) : null}
                <span className="max-w-[220px] truncate">{seg.nameTr}</span>
                {!disabled ? (
                  <button
                    type="button"
                    onClick={() => onChange(value.filter((x) => x !== seg.id))}
                    className="ml-1 rounded hover:text-rose-600"
                    aria-label={`${seg.nameTr} kaldır`}
                  >
                    <XIcon className="h-3 w-3" />
                  </button>
                ) : null}
              </span>
            ))}
          </div>
          {!disabled ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="flex items-center gap-1 text-sm font-semibold text-zinc-600 hover:text-zinc-700"
            >
              <Plus className="h-4 w-4" />
              Kategori Ekle / Düzenle
            </button>
          ) : null}
        </div>
      )}

      {error ? (
        <p className="mt-1.5 text-xs text-rose-600">{error}</p>
      ) : null}

      <SegmentOnlyModal
        isOpen={open}
        onClose={() => setOpen(false)}
        value={value}
        onConfirm={onChange}
        maxSelection={maxSelection}
        title={title}
        description={description}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Modal — popup overlay (CategorySelectorModal'la aynı kabuk)
// ─────────────────────────────────────────────────────────────────────

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  value: string[];
  onConfirm: (ids: string[]) => void;
  maxSelection: number;
  title: string;
  description: string;
}

function SegmentOnlyModal({
  isOpen,
  onClose,
  value,
  onConfirm,
  maxSelection,
  title,
  description,
}: ModalProps) {
  const [draftIds, setDraftIds] = useState<string[]>(value);
  const [search, setSearch] = useState("");
  const [warningMsg, setWarningMsg] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data: segments, isLoading } = useRoots();

  useEffect(() => {
    if (!isOpen) return;
    setDraftIds(value);
    setSearch("");
    setWarningMsg(null);
  }, [isOpen, value]);

  useEffect(() => {
    if (!warningMsg) return;
    const t = setTimeout(() => setWarningMsg(null), 3000);
    return () => clearTimeout(t);
  }, [warningMsg]);

  useEffect(() => {
    if (!isOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    queueMicrotask(() => searchRef.current?.focus());
    return () => {
      document.body.style.overflow = original;
      window.removeEventListener("keydown", onKey);
    };
  }, [isOpen, onClose]);

  const filteredSegments = useMemo(() => {
    // TR-katlanmış karşılaştırma — "insaat" da "İnşaat"ı bulur.
    const q = foldSearchText(search);
    if (!q) return segments ?? [];
    return (segments ?? []).filter((s) =>
      foldSearchText(s.nameTr).includes(q),
    );
  }, [segments, search]);

  if (!isOpen) return null;

  const toggle = (id: string) => {
    if (draftIds.includes(id)) {
      setDraftIds(draftIds.filter((x) => x !== id));
      return;
    }
    if (draftIds.length >= maxSelection) {
      setWarningMsg(`En fazla ${maxSelection} kategori seçebilirsiniz`);
      return;
    }
    setDraftIds([...draftIds, id]);
  };

  const handleConfirm = () => {
    onConfirm(draftIds);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-6 pb-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="segment-only-modal-title"
    >
      <div
        className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2
            id="segment-only-modal-title"
            className="text-lg font-bold text-zinc-900"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 hover:bg-slate-100"
            aria-label="Kapat"
          >
            <XIcon className="h-5 w-5 text-slate-600" />
          </button>
        </div>

        {/* Search + summary */}
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
          <InputGroup>
            <MagnifyingGlassIcon data-slot="icon" />
            <Input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Kategori ara..."
            />
          </InputGroup>
          <p className="mt-2 text-xs text-slate-500">{description}</p>
          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="text-slate-600">
              {draftIds.length} kategori seçildi (max {maxSelection})
            </span>
            {draftIds.length > 0 ? (
              <button
                type="button"
                onClick={() => setDraftIds([])}
                className="text-sm font-semibold text-zinc-600 hover:text-zinc-700"
              >
                Tüm Seçimi Temizle
              </button>
            ) : null}
          </div>
          {warningMsg ? (
            <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              ⚠️ {warningMsg}
            </div>
          ) : null}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-2 py-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : filteredSegments.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">
              Sonuç bulunamadı
            </div>
          ) : (
            <ul className="space-y-0.5" role="listbox">
              {filteredSegments.map((segment) => {
                const isSelected = draftIds.includes(segment.id);
                return (
                  <li key={segment.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => toggle(segment.id)}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                        isSelected
                          ? "bg-zinc-50 hover:bg-zinc-100"
                          : "hover:bg-slate-50"
                      }`}
                    >
                      <div
                        className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 ${
                          isSelected
                            ? "border-zinc-500 bg-zinc-500"
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
                              isSelected ? "text-zinc-600" : "text-slate-400"
                            }`}
                          >
                            {segment.segmentLetter}.
                          </span>
                        ) : null}
                        <span
                          className={`text-sm ${
                            isSelected
                              ? "font-semibold text-zinc-900"
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
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <Button variant="ghost" onClick={onClose}>
            Vazgeç
          </Button>
          <Button onClick={handleConfirm} disabled={draftIds.length === 0}>
            Onayla {draftIds.length > 0 ? `(${draftIds.length})` : ""}
          </Button>
        </div>
      </div>
    </div>
  );
}
