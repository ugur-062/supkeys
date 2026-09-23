import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { UiGallery } from "./gallery";

/**
 * /dev/ui — primitive galerisi (PROMPT 2). YALNIZ geliştirmede: üretimde
 * 404 (rota derlenir ama içerik yok), robots noindex. Public rota listesinde
 * DEĞİL → nonce'lı CSP + dinamik render (galeri için doğru).
 */
export const metadata: Metadata = { title: "UI galerisi", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function DevUiPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <UiGallery />;
}
