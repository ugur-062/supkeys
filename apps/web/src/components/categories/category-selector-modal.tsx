"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import { Checkbox } from "@/components/catalyst/checkbox";
import { Input, InputGroup } from "@/components/catalyst/input";
import { IconButton } from "@/components/ui/icon-button";
import { MagnifyingGlassIcon } from "@heroicons/react/16/solid";
import {
  ChevronRight,
  FolderTree,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";

/** Sol disclosure oku — ▸ kapalı, ▾ açık (90° döner). Klasör ikonu yok. */
function Disclosure({ open }: { open: boolean }) {
  return (
    <ChevronRight
      className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${
        open ? "rotate-90 text-zinc-600" : ""
      }`}
    />
  );
}

/** Disclosure oku olmayan satırlarda hizalama için boşluk. */
function DisclosureSpacer() {
  return <span className="w-4 shrink-0" aria-hidden />;
}
import {
  type CategoryNode,
  type SearchTreeClass,
  type SearchTreeFamily,
  type SearchTreeSegment,
  useCategoriesByIds,
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
  // Seçilen kategorilerin breadcrumb'larını getir — header chip listesi için.
  const { data: selectedInfo } = useCategoriesByIds(draftIds);
  // O(1) lookup için Map'e dönüştür — N seçimde linear .find() yerine.
  const selectedInfoMap = useMemo(() => {
    if (!selectedInfo) return null;
    return new Map(selectedInfo.map((c) => [c.id, c]));
  }, [selectedInfo]);

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

  // Scroll lock + ESC + focus trap'i Headless Dialog yönetir.

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
      ? "İhale için 1 kategori seçin — tedarikçi eşleşmesi bu seçime göre yapılır."
      : "Tedarik edebildiğiniz kategorileri işaretleyin — ilgili ihalelere davet alırsınız.";

  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-[60]">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-zinc-950/45 backdrop-blur-[2px] transition data-closed:opacity-0 data-enter:duration-200 data-leave:duration-150"
      />
      <div className="fixed inset-0 flex w-screen items-start justify-center p-2 pt-4 sm:p-4 sm:pt-6">
        <DialogPanel
          transition
          className="flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-zinc-950/10 outline-none transition data-closed:opacity-0 data-enter:duration-200 data-leave:duration-150 data-closed:data-enter:scale-95 lg:max-w-3xl"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-4 border-b border-zinc-950/5 px-6 py-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-zinc-100">
                <FolderTree className="h-5 w-5 text-zinc-700" />
              </div>
              <div>
                <DialogTitle className="text-lg font-semibold text-zinc-950">
                  {title}
                </DialogTitle>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {description ?? defaultDescription}
                </p>
              </div>
            </div>
            <IconButton aria-label="Kapat" onClick={onClose}>
              <X className="h-5 w-5" />
            </IconButton>
          </div>

          {/* Search bar */}
          <div className="border-b border-zinc-950/5 px-6 py-4">
            <InputGroup>
              <MagnifyingGlassIcon data-slot="icon" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Kategori ara (örn: çelik, kablo, vinç, kaynak)"
                className={search ? "[&_input]:pr-9" : undefined}
              />
            </InputGroup>
          </div>

          {/* Seçilenler — chip listesi (mode=multi'de görünür) */}
          {mode === "multi" ? (
            <div className="border-b border-zinc-950/5 bg-zinc-50/60 px-6 py-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-600">
                  <Sparkles className="h-3.5 w-3.5 text-zinc-500" />
                  Seçimleriniz
                  <span className="ml-1 rounded-full bg-zinc-900 px-1.5 py-0.5 text-xs font-bold text-white">
                    {draftIds.length}/{maxSelection}
                  </span>
                </span>
                {draftIds.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setDraftIds([])}
                    className="text-xs font-semibold text-zinc-500 hover:text-danger-600"
                  >
                    Tümünü temizle
                  </button>
                ) : null}
              </div>
              {draftIds.length === 0 ? (
                <p className="py-1 text-xs italic text-zinc-400">
                  Henüz seçim yok — aşağıdaki listeden veya arama ile kategori
                  ekleyin.
                </p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {draftIds.map((id) => {
                    const info = selectedInfoMap?.get(id);
                    const loading = selectedInfoMap === null;
                    const missing = selectedInfoMap !== null && !info;
                    return (
                      <li key={id}>
                        <Badge
                          color="zinc"
                          className={`gap-1 ${missing ? "italic" : ""}`}
                          title={info?.breadcrumb}
                        >
                          <span className="max-w-[260px] truncate">
                            {info?.nameTr ??
                              (loading ? "…" : "(silinmiş kategori)")}
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleSelection(id)}
                            className="-mr-1 rounded-full p-0.5 hover:text-danger-600"
                            aria-label="Kaldır"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : draftIds.length > 0 ? (
            <div className="border-b border-zinc-950/5 bg-zinc-50/60 px-6 py-2.5">
              <span className="block text-xs font-semibold text-zinc-700">
                ✓ Seçili:{" "}
                {selectedInfo?.[0]?.nameTr ??
                  (selectedInfo === undefined ? "…" : "(silinmiş kategori)")}
              </span>
              {/* Tam yol — "Aksesuarlar" gibi bağlamsız yaprak adları için. */}
              {selectedInfo?.[0]?.breadcrumb ? (
                <span className="mt-0.5 block truncate text-xs text-zinc-500">
                  {selectedInfo[0].breadcrumb}
                </span>
              ) : null}
            </div>
          ) : null}

          {warningMsg ? (
            <div className="border-b border-amber-200 bg-amber-50 px-6 py-2.5 text-xs font-medium text-amber-800">
              ⚠️ {warningMsg}
            </div>
          ) : null}

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-3">
            {isSearching ? (
              <SearchResults
                loading={searchLoading}
                segments={searchTree?.segments ?? []}
                truncated={searchTree?.truncated}
                query={debouncedSearch.trim()}
                selected={draftIds}
                mode={mode}
                onToggle={toggleSelection}
              />
            ) : rootsLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
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
          <div className="flex items-center justify-between gap-3 border-t border-zinc-950/5 bg-zinc-50/60 px-6 py-3.5">
            <span className="text-xs text-zinc-500">
              {mode === "multi" && draftIds.length > 0
                ? `${draftIds.length} seçim hazır — Onayla'ya tıklayın`
                : mode === "single" && draftIds.length === 1
                  ? "1 kategori hazır"
                  : "Listeden seçim yapın"}
            </span>
            <div className="flex items-center gap-2">
              <Button plain onClick={onClose}>
                Vazgeç
              </Button>
              <Button onClick={handleConfirm} disabled={draftIds.length === 0}>
                Onayla{draftIds.length > 0 ? ` (${draftIds.length})` : ""}
              </Button>
            </div>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
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
  if (roots.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-zinc-500">
          Kategori bulunamadı. Sistem yöneticisiyle iletişime geçin.
        </p>
      </div>
    );
  }

  // UNSPSC standardı: 70-94 arası segment kodları hizmettir, diğerleri
  // mal/ürün/ekipman. (Eski `7|8` ilk-hane kontrolü 90+ hizmet segmentlerini
  // yanlışlıkla "Mal" grubuna koyuyordu.)
  const isService = (s: CategoryNode) => {
    const n = Number(s.code.slice(0, 2));
    return n >= 70 && n <= 94;
  };
  const malSegments = roots.filter((s) => !isService(s));
  const hizmetSegments = roots.filter(isService);

  const renderSegment = (segment: CategoryNode) => {
    const isExpanded = expandedSegments.has(segment.id);
    // Kategori id = 8-haneli kod → segment aidiyeti ilk 2 haneden okunur;
    // kapalı başlıkta "bu dalda n seçim var" rozeti ekstra fetch istemez.
    const selCount = selected.filter((id) =>
      id.startsWith(segment.code.slice(0, 2)),
    ).length;
    return (
      <li key={segment.id}>
        <button
          type="button"
          onClick={() => onToggleSegment(segment.id)}
          className={`flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left transition-colors ${
            isExpanded ? "bg-zinc-50" : "hover:bg-zinc-50"
          }`}
        >
          <Disclosure open={isExpanded} />
          <span className="flex-1 text-sm font-semibold text-zinc-900">
            {segment.nameTr}
          </span>
          {selCount > 0 ? (
            <span
              className="rounded-full bg-zinc-900 px-1.5 py-0.5 text-xs font-bold text-white"
              title={`Bu dalda ${selCount} seçim`}
            >
              {selCount}
            </span>
          ) : null}
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
  };

  return (
    <div className="space-y-5">
      {malSegments.length > 0 ? (
        <section>
          <h3 className="mb-1.5 px-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Mal ve Ekipman
          </h3>
          <ul className="space-y-0.5">{malSegments.map(renderSegment)}</ul>
        </section>
      ) : null}

      {hizmetSegments.length > 0 ? (
        <section>
          <h3 className="mb-1.5 px-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Hizmetler
          </h3>
          <ul className="space-y-0.5">{hizmetSegments.map(renderSegment)}</ul>
        </section>
      ) : null}
    </div>
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
        <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
      </div>
    );
  }

  // V2-6.5 — Tek family chain'i atla. Family seviyesinde sadece 1 alt
  // kategori varsa, kullanıcıya "A → tek-B → C..." şeklinde anlamsız bir
  // ara seviye göstermek yerine direkt Class'ları render et. Family ID
  // selection'da kullanılmaz (sadece accordion grup başlığı idi).
  if (families && families.length === 1) {
    return (
      <div className="ml-[15px] mt-0.5 border-l border-zinc-950/5 pl-2">
        <ClassList
          familyId={families[0].id}
          expandedClasses={expandedClasses}
          onToggleClass={onToggleClass}
          selected={selected}
          onToggleSelection={onToggleSelection}
          mode={mode}
        />
      </div>
    );
  }

  return (
    <ul className="ml-[15px] mt-0.5 space-y-0.5 border-l border-zinc-950/5 pl-2">
      {(families ?? []).map((family) => {
        const isExpanded = expandedFamilies.has(family.id);
        const childCount = family._count?.children ?? 0;
        const famSelCount = selected.filter((id) =>
          id.startsWith(family.code.slice(0, 4)),
        ).length;
        return (
          <li key={family.id}>
            <button
              type="button"
              onClick={() => onToggleFamily(family.id)}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors ${
                isExpanded ? "bg-zinc-50" : "hover:bg-zinc-50"
              }`}
            >
              <Disclosure open={isExpanded} />
              <span className="flex-1 text-sm font-medium text-zinc-800">
                {family.nameTr}
              </span>
              {famSelCount > 0 ? (
                <span
                  className="rounded-full bg-zinc-900 px-1.5 py-0.5 text-xs font-bold text-white"
                  title={`Bu dalda ${famSelCount} seçim`}
                >
                  {famSelCount}
                </span>
              ) : null}
              {childCount > 0 ? (
                <span className="text-xs tabular-nums text-zinc-400">
                  {childCount}
                </span>
              ) : null}
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
        <Loader2 className="h-3 w-3 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <ul className="ml-[15px] mt-0.5 space-y-0.5 border-l border-zinc-950/5 pl-2">
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
  const commodityCount = cls._count?.children ?? 0;
  const hasCommodities = commodityCount > 0;
  const isSelected = selected.includes(cls.id);
  // V2-6.5 — Tek commodity zincirinde otomatik açık. Kullanıcı "Class
  // expand → tek alt görme" çift tıklamasından kurtulur. Chevron yine
  // gözükür ama state değişmez (auto-show).
  const autoOpen = commodityCount === 1;
  const effectivelyExpanded = isExpanded || autoOpen;

  return (
    <li>
      <div
        className={`flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors ${
          isSelected ? "bg-zinc-50 ring-1 ring-zinc-950/10" : "hover:bg-zinc-50"
        }`}
      >
        {/* Sol disclosure — yalnızca açılabilir (çok commodity'li) class'larda */}
        {hasCommodities && !autoOpen ? (
          <button
            type="button"
            onClick={() => onToggleExpand(cls.id)}
            className="-ml-1 shrink-0 rounded p-0.5 hover:bg-zinc-100"
            aria-label={isExpanded ? "Daralt" : "Genişlet"}
          >
            <Disclosure open={isExpanded} />
          </button>
        ) : (
          <DisclosureSpacer />
        )}
        <Checkbox
          checked={isSelected}
          onChange={() => onToggleSelection(cls.id)}
          className="flex-shrink-0"
          aria-label={cls.nameTr}
        />
        <button
          type="button"
          onClick={() => onToggleSelection(cls.id)}
          className={`flex-1 text-left text-sm transition-colors ${
            isSelected
              ? "font-semibold text-zinc-900"
              : "text-zinc-700 hover:text-zinc-900"
          }`}
        >
          {cls.nameTr}
        </button>
        {hasCommodities ? (
          <span className="text-xs tabular-nums text-zinc-400">
            {commodityCount}
          </span>
        ) : null}
      </div>

      {effectivelyExpanded && hasCommodities ? (
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
        <Loader2 className="h-3 w-3 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <ul className="ml-[15px] mt-0.5 space-y-0.5 border-l border-zinc-950/5 pl-2">
      {(commodities ?? []).map((com) => {
        const isSelected = selected.includes(com.id);
        return (
          <li
            key={com.id}
            className={`flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors ${
              isSelected ? "bg-zinc-50 ring-1 ring-zinc-950/10" : "hover:bg-zinc-50"
            }`}
          >
            <DisclosureSpacer />
            <Checkbox
              checked={isSelected}
              onChange={() => onToggleSelection(com.id)}
              className="flex-shrink-0"
              aria-label={com.nameTr}
            />
            <button
              type="button"
              onClick={() => onToggleSelection(com.id)}
              className={`flex-1 text-left text-sm transition-colors ${
                isSelected
                  ? "font-medium text-zinc-900"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
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
  /** Backend 200 sonuç tavanına takıldı — "aramayı daraltın" notu gösterilir. */
  truncated?: boolean;
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
  truncated,
  query,
  selected,
  mode,
  onToggle,
}: SearchResultsProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (segments.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm font-medium text-zinc-700">
          &ldquo;{query}&rdquo; için sonuç bulunamadı
        </p>
        <p className="mt-1.5 text-xs text-zinc-500">
          Daha genel bir terim deneyin (örn. marka yerine ürün adı) veya
          aramayı temizleyip listeye göz atın.
        </p>
      </div>
    );
  }

  return (
    <>
      {truncated ? (
        <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Çok fazla sonuç var — tümü gösterilemiyor. Aramanızı daraltın.
        </p>
      ) : null}
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
    </>
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
      <div className="flex items-center gap-2 px-2 py-2 text-sm font-semibold text-zinc-900">
        <Disclosure open />
        <span>{segment.nameTr}</span>
      </div>
      <ul className="ml-[15px] space-y-1 border-l border-zinc-950/5 pl-2">
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
      <div className="flex items-center gap-2 px-2 py-1.5 text-sm font-medium text-zinc-700">
        <Disclosure open />
        <span>{family.nameTr}</span>
      </div>
      <ul className="ml-[15px] space-y-0.5 border-l border-zinc-950/5 pl-2">
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
          className={`flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-zinc-50 ${
            isSelected ? "bg-zinc-50 ring-1 ring-zinc-950/10" : ""
          }`}
        >
          <DisclosureSpacer />
          <Checkbox
            checked={isSelected}
            onChange={() => onToggle(cls.id)}
            className="flex-shrink-0"
            aria-label={cls.nameTr}
          />
          <button
            type="button"
            onClick={() => onToggle(cls.id)}
            className="flex-1 text-left text-sm text-zinc-700"
          >
            <HighlightMatch text={cls.nameTr} query={query} />
          </button>
        </div>
      ) : hasCommodities ? (
        <div className="flex items-center gap-2 px-2 py-1.5 text-sm font-medium text-zinc-600">
          <Disclosure open />
          <span>{cls.nameTr}</span>
        </div>
      ) : null}

      {hasCommodities ? (
        <ul
          className={`space-y-0.5 ${
            cls.isMatch
              ? "ml-[15px] border-l border-zinc-950/5 pl-2"
              : "ml-[15px] border-l border-zinc-950/5 pl-2"
          }`}
        >
          {cls.commodities.map((com) => {
            const comSelected = selected.includes(com.id);
            return (
              <li
                key={com.id}
                className={`flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-zinc-50 ${
                  comSelected ? "bg-zinc-50 ring-1 ring-zinc-950/10" : ""
                }`}
              >
                <DisclosureSpacer />
                <Checkbox
                  checked={comSelected}
                  onChange={() => onToggle(com.id)}
                  className="flex-shrink-0"
                  aria-label={com.nameTr}
                />
                <button
                  type="button"
                  onClick={() => onToggle(com.id)}
                  className="flex-1 text-left text-sm text-zinc-600"
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

/**
 * Uzunluk-koruyan TR katlama — vurgu konumu için karakter-karakter eşleme.
 * (shared `foldSearchText` boşluk tekilleştirdiğinden index kayar; burada
 * her karakter tek karaktere katlanır ki katlanmış index = orijinal index.)
 */
const HIGHLIGHT_FOLD: Record<string, string> = {
  ç: "c", Ç: "c", ş: "s", Ş: "s", ğ: "g", Ğ: "g", ü: "u", Ü: "u",
  ö: "o", Ö: "o", ı: "i", İ: "i", â: "a", Â: "a", î: "i", Î: "i",
  û: "u", Û: "u",
};
function foldForHighlight(s: string): string {
  return Array.from(s)
    .map((ch) => HIGHLIGHT_FOLD[ch] ?? ch.toLowerCase())
    .join("");
}

/**
 * Eşleşen substring'i vurgular — TR-katlanmış karşılaştırma: "iskele" sorgusu
 * "İskele sistemleri"ni, "jenerator" "jeneratör"ü vurgular (backend araması da
 * aynı katlamayla eşleştiğinden vurgu sonuçla tutarlı).
 */
function HighlightMatch({ text, query }: { text: string; query: string }) {
  const trimmed = query.trim();
  if (!trimmed) return <>{text}</>;
  const foldedText = foldForHighlight(text);
  const foldedQuery = foldForHighlight(trimmed);
  if (!foldedQuery) return <>{text}</>;

  const chars = Array.from(text);
  const parts: Array<{ str: string; hit: boolean }> = [];
  let cursor = 0;
  let idx = foldedText.indexOf(foldedQuery);
  while (idx !== -1) {
    if (idx > cursor) {
      parts.push({ str: chars.slice(cursor, idx).join(""), hit: false });
    }
    const end = idx + Array.from(foldedQuery).length;
    parts.push({ str: chars.slice(idx, end).join(""), hit: true });
    cursor = end;
    idx = foldedText.indexOf(foldedQuery, end);
  }
  if (cursor < chars.length) {
    parts.push({ str: chars.slice(cursor).join(""), hit: false });
  }

  return (
    <>
      {parts.map((part, i) =>
        part.hit ? (
          <mark
            key={i}
            className="rounded bg-amber-100 px-0.5 font-semibold text-amber-900"
          >
            {part.str}
          </mark>
        ) : (
          <span key={i}>{part.str}</span>
        ),
      )}
    </>
  );
}
