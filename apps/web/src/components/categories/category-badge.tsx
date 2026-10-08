import { Tag } from "lucide-react";
import { plainBreadcrumb } from "./category-breadcrumb";

interface CategoryShape {
  nameTr?: string | null;
  breadcrumb?: string | null;
}

interface Props {
  category: CategoryShape | null | undefined;
  size?: "sm" | "md";
}

/**
 * V2-6 — Tek bir kategori chip'i. Liste/detay/badge tüm yerlerde tutarlı görünüm.
 *
 * Segment harfi ("B.", "AN.") GÖSTERİLMEZ: Ariba'nın iç segment kodudur, 29
 * segment gizli olduğu için aralıklı görünür ve kullanıcıya bir şey söylemez
 * (2026-10 kayıt denetimi). Yol metninin başındaki harf de aynı nedenle atılır.
 */
export function CategoryBadge({ category, size = "md" }: Props) {
  if (!category || !category.nameTr) return null;

  const breadcrumb = plainBreadcrumb(category.breadcrumb);

  return (
    <span
      className={`inline-flex max-w-full items-center gap-2 rounded-md bg-zinc-50 text-zinc-700 font-semibold border border-zinc-100 ${
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs"
      }`}
      title={breadcrumb || category.nameTr}
    >
      <Tag className={`shrink-0 ${size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"}`} />
      <span className="truncate">{category.nameTr}</span>
    </span>
  );
}
