import { Tag } from "lucide-react";

interface CategoryShape {
  nameTr?: string | null;
  segmentLetter?: string | null;
  breadcrumb?: string | null;
  parent?: { segmentLetter?: string | null; nameTr?: string | null } | null;
}

interface Props {
  category: CategoryShape | null | undefined;
  size?: "sm" | "md";
  showSegmentLetter?: boolean;
}

/**
 * V2-6 — Tek bir kategori chip'i. Liste/detay/badge tüm yerlerde tutarlı görünüm.
 * `breadcrumb` field'ı (backend'den) varsa segmentLetter+name otomatik render olur.
 */
export function CategoryBadge({
  category,
  size = "md",
  showSegmentLetter = true,
}: Props) {
  if (!category || !category.nameTr) return null;

  const segmentLetter =
    category.segmentLetter ?? category.parent?.segmentLetter ?? null;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md bg-zinc-50 text-zinc-700 font-semibold border border-zinc-100 ${
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs"
      }`}
      title={category.breadcrumb ?? category.nameTr}
    >
      <Tag className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
      {showSegmentLetter && segmentLetter ? (
        <span className="font-mono opacity-60">{segmentLetter}.</span>
      ) : null}
      <span className="truncate">{category.nameTr}</span>
    </span>
  );
}
