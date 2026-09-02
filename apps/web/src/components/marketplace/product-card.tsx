import { CategoryImage } from "./category-image";
import { productPrice } from "@/lib/public/product-price";
import type { PublicProductCard } from "@/lib/public/marketplace-api";
import { ChevronRightIcon } from "@heroicons/react/20/solid";
import Link from "next/link";

/**
 * Ürün kartı — SUNUCU bileşeni.
 *
 * İlan kartıyla aynı yüzey dili (`ring-1` + `shadow-sm`) ama iki farkı var:
 *  · görsel ZORUNLU olduğu için gerçek fotoğraf gösterilir (yoksa kategori
 *    görseline düşer — taslaktan yayına geçen kayıtta boşluk kalmasın),
 *  · fiyat her zaman bir CÜMLE gösterir; "teklif isteyin" de bir fiyattır.
 */
export function ProductCard({
  companySlug,
  product,
}: {
  companySlug: string;
  product: PublicProductCard;
}) {
  const price = productPrice(product);
  const cover = product.images[0];

  return (
    <Link
      href={`/firma/${companySlug}/urun/${product.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-950/5 transition duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:ring-zinc-950/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950"
    >
      <CategoryImage
        src={cover}
        categoryIds={product.categoryId ? [product.categoryId] : []}
        alt={product.name}
        ratio="aspect-[4/3]"
        className="border-b border-zinc-950/5"
      />

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 text-sm/5 font-semibold tracking-tight text-zinc-950">
            {product.name}
          </h3>
          <ChevronRightIcon
            aria-hidden
            className="mt-0.5 size-4 shrink-0 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-zinc-500"
          />
        </div>

        {product.excerpt ? (
          <p className="mt-1.5 line-clamp-2 text-xs/5 text-zinc-500">
            {product.excerpt}
          </p>
        ) : null}

        <div className="mt-auto pt-4">
          <p
            className={`text-sm font-semibold ${
              price.hasPrice ? "text-zinc-950" : "text-zinc-500"
            }`}
          >
            {price.headline}
          </p>
          {product.moq ? (
            <p className="mt-0.5 text-xs text-zinc-400">
              Min. {Number(product.moq).toLocaleString("tr-TR")} {product.unit}
            </p>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
