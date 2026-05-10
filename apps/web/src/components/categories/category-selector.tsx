"use client";

import {
  type CategoryNode,
  useCategorySearch,
  useCategoryTree,
} from "@/hooks/use-categories";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { ChevronDown, Loader2, Search } from "lucide-react";
import { useEffect, useState } from "react";

interface Props {
  value: string[];
  onChange: (ids: string[]) => void;
  mode?: "single" | "multi";
  maxSelection?: number;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
}

const DEFAULT_PLACEHOLDER =
  "500'den fazla kategori arasından sizin için en uygun kategorileri arayın";

export function CategorySelector({
  value,
  onChange,
  mode = "multi",
  maxSelection = 20,
  placeholder = DEFAULT_PLACEHOLDER,
  disabled,
  error,
}: Props) {
  const { data: tree, isLoading: treeLoading } = useCategoryTree();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const { data: searchResults, isLoading: searchLoading } =
    useCategorySearch(debouncedSearch);

  const [expandedSegments, setExpandedSegments] = useState<Set<string>>(
    new Set(),
  );
  const [warningMsg, setWarningMsg] = useState<string | null>(null);

  const isSearching = debouncedSearch.trim().length >= 2;

  useEffect(() => {
    if (!warningMsg) return;
    const t = setTimeout(() => setWarningMsg(null), 3000);
    return () => clearTimeout(t);
  }, [warningMsg]);

  const toggleSegment = (segmentId: string) => {
    setExpandedSegments((prev) => {
      const next = new Set(prev);
      if (next.has(segmentId)) next.delete(segmentId);
      else next.add(segmentId);
      return next;
    });
  };

  const toggleCategory = (categoryId: string) => {
    if (disabled) return;

    if (mode === "single") {
      onChange(value.includes(categoryId) ? [] : [categoryId]);
      return;
    }

    if (value.includes(categoryId)) {
      onChange(value.filter((id) => id !== categoryId));
      return;
    }
    if (value.length >= maxSelection) {
      setWarningMsg(`En fazla ${maxSelection} kategori seçebilirsiniz`);
      return;
    }
    onChange([...value, categoryId]);
  };

  const clearAll = () => onChange([]);

  if (treeLoading) {
    return (
      <div className="border border-slate-200 rounded-2xl bg-white">
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`border rounded-2xl overflow-hidden bg-white ${
        error ? "border-rose-300" : "border-slate-200"
      }`}
    >
      <div className="p-3 border-b border-slate-200 bg-slate-50">
        <div className="relative">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={placeholder}
            className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border border-slate-200 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 bg-white"
            disabled={disabled}
          />
        </div>

        <div className="flex items-center justify-between mt-2 text-xs">
          <span className="text-slate-500">
            {mode === "single"
              ? "İhale kategorisini seçin"
              : `${value.length} kategori seçildi (max ${maxSelection})`}
          </span>
          {value.length > 0 ? (
            <button
              type="button"
              onClick={clearAll}
              className="text-brand-600 hover:text-brand-700 font-semibold"
              disabled={disabled}
            >
              Tüm Seçimi Temizle
            </button>
          ) : null}
        </div>

        {warningMsg ? (
          <div className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded">
            ⚠️ {warningMsg}
          </div>
        ) : null}
      </div>

      <div className="max-h-96 overflow-y-auto">
        {isSearching ? (
          <SearchPanel
            loading={searchLoading}
            results={searchResults ?? []}
            value={value}
            mode={mode}
            disabled={disabled}
            onToggle={toggleCategory}
          />
        ) : (
          <TreePanel
            tree={tree ?? []}
            expandedSegments={expandedSegments}
            onToggleSegment={toggleSegment}
            value={value}
            mode={mode}
            disabled={disabled}
            onToggle={toggleCategory}
          />
        )}
      </div>

      {error ? (
        <p className="text-xs text-rose-600 px-3 py-2 bg-rose-50 border-t border-rose-200">
          {error}
        </p>
      ) : null}
    </div>
  );
}

interface SearchPanelProps {
  loading: boolean;
  results: Array<{ id: string; nameTr: string; breadcrumb: string }>;
  value: string[];
  mode: "single" | "multi";
  disabled?: boolean;
  onToggle: (id: string) => void;
}

function SearchPanel({
  loading,
  results,
  value,
  mode,
  disabled,
  onToggle,
}: SearchPanelProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }
  if (results.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-slate-500">
        Sonuç bulunamadı
      </div>
    );
  }
  return (
    <ul className="p-2 space-y-1">
      {results.map((r) => {
        const isSelected = value.includes(r.id);
        return (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => onToggle(r.id)}
              disabled={disabled}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-start gap-2 transition-colors ${
                isSelected
                  ? "bg-brand-50 text-brand-900"
                  : "hover:bg-slate-50 text-slate-700"
              }`}
            >
              <input
                type={mode === "single" ? "radio" : "checkbox"}
                checked={isSelected}
                onChange={() => undefined}
                className="mt-0.5 flex-shrink-0"
                readOnly
                disabled={disabled}
              />
              <div className="flex-1 min-w-0">
                <p
                  className={`font-medium ${
                    isSelected ? "text-brand-900" : "text-slate-900"
                  }`}
                >
                  {r.nameTr}
                </p>
                <p className="text-xs text-slate-500 truncate">{r.breadcrumb}</p>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

interface TreePanelProps {
  tree: CategoryNode[];
  expandedSegments: Set<string>;
  onToggleSegment: (id: string) => void;
  value: string[];
  mode: "single" | "multi";
  disabled?: boolean;
  onToggle: (id: string) => void;
}

function TreePanel({
  tree,
  expandedSegments,
  onToggleSegment,
  value,
  mode,
  disabled,
  onToggle,
}: TreePanelProps) {
  return (
    <ul className="divide-y divide-slate-100">
      {tree.map((segment) => {
        const isExpanded = expandedSegments.has(segment.id);
        const selectedInSegment = (segment.children ?? []).filter((f) =>
          value.includes(f.id),
        ).length;

        return (
          <li key={segment.id}>
            <button
              type="button"
              onClick={() => onToggleSegment(segment.id)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-brand-900">
                  {segment.segmentLetter ? (
                    <span className="font-mono text-slate-400 mr-2">
                      {segment.segmentLetter}.
                    </span>
                  ) : null}
                  {segment.nameTr}
                </span>
                {selectedInSegment > 0 ? (
                  <span className="text-[10px] bg-brand-100 text-brand-700 rounded-full px-1.5 py-0.5 font-semibold">
                    {selectedInSegment}
                  </span>
                ) : null}
              </div>
              <ChevronDown
                className={`h-4 w-4 text-slate-400 transition-transform ${
                  isExpanded ? "rotate-180" : ""
                }`}
              />
            </button>

            {isExpanded && segment.children && segment.children.length > 0 ? (
              <ul className="bg-slate-50/50 px-4 pb-2">
                {segment.children.map((family) => {
                  const isSelected = value.includes(family.id);
                  return (
                    <li key={family.id}>
                      <button
                        type="button"
                        onClick={() => onToggle(family.id)}
                        disabled={disabled}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${
                          isSelected
                            ? "bg-brand-100 text-brand-900 font-semibold"
                            : "hover:bg-white text-slate-700"
                        }`}
                      >
                        <input
                          type={mode === "single" ? "radio" : "checkbox"}
                          checked={isSelected}
                          onChange={() => undefined}
                          className="flex-shrink-0"
                          readOnly
                          disabled={disabled}
                        />
                        <span>{family.nameTr}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
