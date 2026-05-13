"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Loader2, Search, X } from "lucide-react";
import {
  type CategoryNode,
  type SearchTreeClass,
  type SearchTreeFamily,
  type SearchTreeSegment,
  useCategorySearchTree,
  useChildren,
  useRoots,
} from "@/hooks/use-categories";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  value: string[];
  onConfirm: (ids: string[]) => void;
  mode?: "single" | "multi";
  maxSelection?: number;
  title?: string;
  description?: string;
}

/**
 * V2-6 — PratisPro tarzı modal kategori seçici. 4-seviye lazy loading:
 *  Segment → Family → Class (seçilebilir) → Commodity (seçilebilir).
 * Sadece Class + Commodity seçilebilir; Segment + Family accordion başlığı.
 *
 * Draft state pattern: kullanıcı "Onayla" yapana kadar parent onChange tetiklenmez.
 */
export function CategorySelectorModal({
  isOpen,
  onClose,
  value,
  onConfirm,
  mode = "multi",
  maxSelection = 20,
  title = "Kategori Seç",
  description,
}: Props) {
  const [draftIds, setDraftIds] = useState<string[]>(value);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [warningMsg, setWarningMsg] = useState<string | null>(null);

  const [expandedSegments, setExpandedSegments] = useState<Set<string>>(
    new Set(),
  );
  const [expandedFamilies, setExpandedFamilies] = useState<Set<string>>(
    new Set(),
  );
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(
    new Set(),
  );

  const { data: roots, isLoading: rootsLoading } = useRoots();
  const { data: searchTree, isLoading: searchLoading } =
    useCategorySearchTree(debouncedSearch);

  const isSearching = debouncedSearch.trim().length >= 2;

  // Modal her açılışta draft'ı parent value'ya sıfırlar.
  useEffect(() => {
    if (!isOpen) return;
    setDraftIds(value);
    setSearch("");
    setExpandedSegments(new Set());
    setExpandedFamilies(new Set());
    setExpandedClasses(new Set());
    setWarningMsg(null);
  }, [isOpen, value]);

  useEffect(() => {
    if (!warningMsg) return;
    const t = setTimeout(() => setWarningMsg(null), 3000);
    return () => clearTimeout(t);
  }, [warningMsg]);

  // Body scroll lock + ESC to close
  useEffect(() => {
    if (!isOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = original;
      window.removeEventListener("keydown", onKey);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const toggle = (setter: React.Dispatch<React.SetStateAction<Set<string>>>) =>
    (id: string) => {
      setter((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    };

  const toggleSelection = (id: string) => {
    if (mode === "single") {
      setDraftIds(draftIds.includes(id) ? [] : [id]);
      return;
    }
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

  const defaultDescription =
    mode === "single"
      ? "İhalenizin doğru tedarikçilerle eşleştirilmesi için ihale kategorisini seçmelisiniz."
      : "Tedarik edebileceğiniz kategorileri seçmelisiniz. Doğru ihalelere davet edilmek için isabetli seçim önemlidir.";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-4 pb-4 sm:pt-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="category-modal-title"
    >
      <div
        className="flex max-h-[94vh] w-full max-w-[90vw] flex-col rounded-2xl bg-white shadow-2xl xl:max-w-7xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2
            id="category-modal-title"
            className="text-lg font-bold text-brand-900"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 hover:bg-slate-100"
            aria-label="Kapat"
          >
            <X className="h-5 w-5 text-slate-600" />
          </button>
        </div>

        {/* Search + summary */}
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div className="relative">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="500'den fazla ana kategori arasından arayın"
              className="w-full rounded-lg border border-slate-200 bg-white py-3 pl-4 pr-12 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            <Search className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {description ?? defaultDescription}
          </p>

          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="text-slate-600">
              {mode === "single"
                ? draftIds.length > 0
                  ? "1 kategori seçildi"
                  : "Henüz kategori seçilmedi"
                : `${draftIds.length} kategori seçildi (max ${maxSelection})`}
            </span>
            {draftIds.length > 0 ? (
              <button
                type="button"
                onClick={() => setDraftIds([])}
                className="text-sm font-semibold text-brand-600 hover:text-brand-700"
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
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {isSearching ? (
            <SearchResults
              loading={searchLoading}
              segments={searchTree?.segments ?? []}
              query={debouncedSearch.trim()}
              selected={draftIds}
              mode={mode}
              onToggle={toggleSelection}
            />
          ) : rootsLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : (
            <SegmentList
              roots={roots ?? []}
              expandedSegments={expandedSegments}
              expandedFamilies={expandedFamilies}
              expandedClasses={expandedClasses}
              onToggleSegment={toggle(setExpandedSegments)}
              onToggleFamily={toggle(setExpandedFamilies)}
              onToggleClass={toggle(setExpandedClasses)}
              selected={draftIds}
              onToggleSelection={toggleSelection}
              mode={mode}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            Vazgeç
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={draftIds.length === 0}
            className="rounded-lg bg-brand-500 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Onayla {draftIds.length > 0 ? `(${draftIds.length})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Internal subcomponents
// ─────────────────────────────────────────────────────────────────────

interface SegmentListProps {
  roots: CategoryNode[];
  expandedSegments: Set<string>;
  expandedFamilies: Set<string>;
  expandedClasses: Set<string>;
  onToggleSegment: (id: string) => void;
  onToggleFamily: (id: string) => void;
  onToggleClass: (id: string) => void;
  selected: string[];
  onToggleSelection: (id: string) => void;
  mode: "single" | "multi";
}

function SegmentList({
  roots,
  expandedSegments,
  expandedFamilies,
  expandedClasses,
  onToggleSegment,
  onToggleFamily,
  onToggleClass,
  selected,
  onToggleSelection,
  mode,
}: SegmentListProps) {
  return (
    <ul className="space-y-1">
      {roots.map((segment) => {
        const isExpanded = expandedSegments.has(segment.id);
        return (
          <li key={segment.id}>
            <button
              type="button"
              onClick={() => onToggleSegment(segment.id)}
              className="flex w-full items-center justify-between rounded-lg px-2 py-3 text-left hover:bg-slate-50"
            >
              <span className="flex items-center gap-2 text-sm font-medium text-brand-900">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                {segment.segmentLetter ? `${segment.segmentLetter}. ` : ""}
                {segment.nameTr}
              </span>
              <ChevronDown
                className={`h-4 w-4 text-slate-400 transition-transform ${
                  isExpanded ? "rotate-180" : ""
                }`}
              />
            </button>

            {isExpanded ? (
              <FamilyList
                segmentId={segment.id}
                expandedFamilies={expandedFamilies}
                expandedClasses={expandedClasses}
                onToggleFamily={onToggleFamily}
                onToggleClass={onToggleClass}
                selected={selected}
                onToggleSelection={onToggleSelection}
                mode={mode}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

interface FamilyListProps {
  segmentId: string;
  expandedFamilies: Set<string>;
  expandedClasses: Set<string>;
  onToggleFamily: (id: string) => void;
  onToggleClass: (id: string) => void;
  selected: string[];
  onToggleSelection: (id: string) => void;
  mode: "single" | "multi";
}

function FamilyList({
  segmentId,
  expandedFamilies,
  expandedClasses,
  onToggleFamily,
  onToggleClass,
  selected,
  onToggleSelection,
  mode,
}: FamilyListProps) {
  const { data: families, isLoading } = useChildren(segmentId);

  if (isLoading) {
    return (
      <div className="ml-6 py-3">
        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <ul className="ml-6 mt-1 space-y-1 border-l border-slate-200 pl-3">
      {(families ?? []).map((family) => {
        const isExpanded = expandedFamilies.has(family.id);
        return (
          <li key={family.id}>
            <button
              type="button"
              onClick={() => onToggleFamily(family.id)}
              className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left hover:bg-slate-50"
            >
              <span className="flex items-center gap-2 text-sm text-slate-700">
                <span className="h-1 w-1 rounded-full bg-slate-300" />
                {family.nameTr}
              </span>
              <ChevronDown
                className={`h-4 w-4 text-slate-400 transition-transform ${
                  isExpanded ? "rotate-180" : ""
                }`}
              />
            </button>

            {isExpanded ? (
              <ClassList
                familyId={family.id}
                expandedClasses={expandedClasses}
                onToggleClass={onToggleClass}
                selected={selected}
                onToggleSelection={onToggleSelection}
                mode={mode}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

interface ClassListProps {
  familyId: string;
  expandedClasses: Set<string>;
  onToggleClass: (id: string) => void;
  selected: string[];
  onToggleSelection: (id: string) => void;
  mode: "single" | "multi";
}

function ClassList({
  familyId,
  expandedClasses,
  onToggleClass,
  selected,
  onToggleSelection,
  mode,
}: ClassListProps) {
  const { data: classes, isLoading } = useChildren(familyId);

  if (isLoading) {
    return (
      <div className="ml-6 py-2">
        <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <ul className="ml-6 mt-1 space-y-0.5 border-l border-slate-200 pl-3">
      {(classes ?? []).map((cls) => (
        <ClassRow
          key={cls.id}
          cls={cls}
          isExpanded={expandedClasses.has(cls.id)}
          onToggleExpand={onToggleClass}
          selected={selected}
          onToggleSelection={onToggleSelection}
          mode={mode}
        />
      ))}
    </ul>
  );
}

interface ClassRowProps {
  cls: CategoryNode;
  isExpanded: boolean;
  onToggleExpand: (id: string) => void;
  selected: string[];
  onToggleSelection: (id: string) => void;
  mode: "single" | "multi";
}

function ClassRow({
  cls,
  isExpanded,
  onToggleExpand,
  selected,
  onToggleSelection,
  mode,
}: ClassRowProps) {
  const hasCommodities = (cls._count?.children ?? 0) > 0;
  const isSelected = selected.includes(cls.id);

  return (
    <li>
      <div
        className={`flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50 ${
          isSelected ? "bg-brand-50" : ""
        }`}
      >
        <input
          type={mode === "single" ? "radio" : "checkbox"}
          checked={isSelected}
          onChange={() => onToggleSelection(cls.id)}
          className="flex-shrink-0"
          aria-label={cls.nameTr}
        />
        <button
          type="button"
          onClick={() => onToggleSelection(cls.id)}
          className="flex-1 text-left text-sm text-slate-700"
        >
          {cls.nameTr}
        </button>
        {hasCommodities ? (
          <button
            type="button"
            onClick={() => onToggleExpand(cls.id)}
            className="rounded p-1 hover:bg-slate-100"
            aria-label={isExpanded ? "Daralt" : "Genişlet"}
          >
            <ChevronDown
              className={`h-4 w-4 text-slate-400 transition-transform ${
                isExpanded ? "rotate-180" : ""
              }`}
            />
          </button>
        ) : null}
      </div>

      {isExpanded && hasCommodities ? (
        <CommodityList
          classId={cls.id}
          selected={selected}
          onToggleSelection={onToggleSelection}
          mode={mode}
        />
      ) : null}
    </li>
  );
}

interface CommodityListProps {
  classId: string;
  selected: string[];
  onToggleSelection: (id: string) => void;
  mode: "single" | "multi";
}

function CommodityList({
  classId,
  selected,
  onToggleSelection,
  mode,
}: CommodityListProps) {
  const { data: commodities, isLoading } = useChildren(classId);

  if (isLoading) {
    return (
      <div className="ml-6 py-1">
        <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <ul className="ml-6 mt-0.5 space-y-0.5 border-l border-slate-200 pl-3">
      {(commodities ?? []).map((com) => {
        const isSelected = selected.includes(com.id);
        return (
          <li
            key={com.id}
            className={`flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50 ${
              isSelected ? "bg-brand-50" : ""
            }`}
          >
            <input
              type={mode === "single" ? "radio" : "checkbox"}
              checked={isSelected}
              onChange={() => onToggleSelection(com.id)}
              className="flex-shrink-0"
              aria-label={com.nameTr}
            />
            <button
              type="button"
              onClick={() => onToggleSelection(com.id)}
              className="flex-1 text-left text-xs text-slate-600"
            >
              {com.nameTr}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

interface SearchResultsProps {
  loading: boolean;
  segments: SearchTreeSegment[];
  query: string;
  selected: string[];
  mode: "single" | "multi";
  onToggle: (id: string) => void;
}

/**
 * PratisPro tarzı hiyerarşik arama sonucu: eşleşen Class/Commodity'leri
 * parent path'leri (Segment → Family → Class → Commodity) ile birlikte
 * tree olarak gösterir. Path başlıkları auto-expanded, kardeş kategoriler
 * gizli — sadece match yolundaki düğümler render olur.
 */
function SearchResults({
  loading,
  segments,
  query,
  selected,
  mode,
  onToggle,
}: SearchResultsProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  if (segments.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-slate-500">
        Sonuç bulunamadı
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {segments.map((seg) => (
        <SearchSegmentBlock
          key={seg.id}
          segment={seg}
          query={query}
          selected={selected}
          onToggle={onToggle}
          mode={mode}
        />
      ))}
    </ul>
  );
}

function SearchSegmentBlock({
  segment,
  query,
  selected,
  onToggle,
  mode,
}: {
  segment: SearchTreeSegment;
  query: string;
  selected: string[];
  onToggle: (id: string) => void;
  mode: "single" | "multi";
}) {
  return (
    <li>
      <div className="flex items-center gap-2 py-2 text-sm font-semibold text-brand-900">
        <ChevronDown className="h-4 w-4 text-slate-400" />
        {segment.segmentLetter ? (
          <span className="text-xs text-slate-500">
            {segment.segmentLetter}.
          </span>
        ) : null}
        <span>{segment.nameTr}</span>
      </div>
      <ul className="ml-6 space-y-1 border-l border-slate-200 pl-3">
        {segment.families.map((fam) => (
          <SearchFamilyBlock
            key={fam.id}
            family={fam}
            query={query}
            selected={selected}
            onToggle={onToggle}
            mode={mode}
          />
        ))}
      </ul>
    </li>
  );
}

function SearchFamilyBlock({
  family,
  query,
  selected,
  onToggle,
  mode,
}: {
  family: SearchTreeFamily;
  query: string;
  selected: string[];
  onToggle: (id: string) => void;
  mode: "single" | "multi";
}) {
  return (
    <li>
      <div className="flex items-center gap-2 py-1.5 text-sm text-slate-700">
        <ChevronDown className="h-4 w-4 text-slate-400" />
        <span>{family.nameTr}</span>
      </div>
      <ul className="ml-6 space-y-0.5 border-l border-slate-200 pl-3">
        {family.classes.map((cls) => (
          <SearchClassBlock
            key={cls.id}
            cls={cls}
            query={query}
            selected={selected}
            onToggle={onToggle}
            mode={mode}
          />
        ))}
      </ul>
    </li>
  );
}

function SearchClassBlock({
  cls,
  query,
  selected,
  onToggle,
  mode,
}: {
  cls: SearchTreeClass;
  query: string;
  selected: string[];
  onToggle: (id: string) => void;
  mode: "single" | "multi";
}) {
  const isSelected = selected.includes(cls.id);
  const hasCommodities = cls.commodities.length > 0;

  return (
    <li>
      {cls.isMatch ? (
        <div
          className={`flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50 ${
            isSelected ? "bg-brand-50" : ""
          }`}
        >
          <input
            type={mode === "single" ? "radio" : "checkbox"}
            checked={isSelected}
            onChange={() => onToggle(cls.id)}
            className="flex-shrink-0"
            aria-label={cls.nameTr}
          />
          <button
            type="button"
            onClick={() => onToggle(cls.id)}
            className="flex-1 text-left text-sm text-slate-700"
          >
            <HighlightMatch text={cls.nameTr} query={query} />
          </button>
        </div>
      ) : hasCommodities ? (
        <div className="flex items-center gap-2 py-1.5 text-xs text-slate-500">
          <ChevronDown className="h-3 w-3" />
          <span>{cls.nameTr}</span>
        </div>
      ) : null}

      {hasCommodities ? (
        <ul
          className={`space-y-0.5 ${
            cls.isMatch
              ? "ml-6 border-l border-slate-200 pl-3"
              : "ml-5 pl-3"
          }`}
        >
          {cls.commodities.map((com) => {
            const comSelected = selected.includes(com.id);
            return (
              <li
                key={com.id}
                className={`flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-slate-50 ${
                  comSelected ? "bg-brand-50" : ""
                }`}
              >
                <input
                  type={mode === "single" ? "radio" : "checkbox"}
                  checked={comSelected}
                  onChange={() => onToggle(com.id)}
                  className="flex-shrink-0"
                  aria-label={com.nameTr}
                />
                <button
                  type="button"
                  onClick={() => onToggle(com.id)}
                  className="flex-1 text-left text-xs text-slate-600"
                >
                  <HighlightMatch text={com.nameTr} query={query} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </li>
  );
}

/** Eşleşen substring'i bold/highlight ile vurgular (case-insensitive). */
function HighlightMatch({ text, query }: { text: string; query: string }) {
  const trimmed = query.trim();
  if (!trimmed) return <>{text}</>;
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "i"));
  const lower = trimmed.toLowerCase();
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === lower ? (
          <mark
            key={i}
            className="rounded bg-amber-100 px-0.5 font-semibold text-amber-900"
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}
