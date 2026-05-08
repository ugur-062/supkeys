"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

export interface BaseListFilters {
  search?: string;
  sort?: string;
  page?: number;
  [key: string]: string | number | boolean | undefined;
}

interface Options {
  /**
   * URL'de yer almasa bile filtre sayımı dışında kalacak parametreler.
   * Default: ["page", "sort"]. Tab veya kalıcı sıralama tercihi gibi
   * "filtre değil" sayılan keys eklemek için.
   */
  ignoredFilterKeys?: string[];
}

const DEFAULT_IGNORED = ["page", "sort"];

/**
 * Polish-1 — Liste sayfaları için URL query string sync hook.
 *
 *   const { filters, setFilters, clearFilters, activeFilterCount } =
 *     useListFilters<{ search?: string; status?: string; sort?: string; page?: number }>({
 *       sort: "createdAt:desc",
 *     });
 *
 * - Boş/false/undefined değerler URL'den silinir.
 * - Filtre değişince `page` otomatik silinir (1'e dönüş).
 * - clearFilters → bare URL.
 * - activeFilterCount → page+sort dışındaki query keys.
 */
export function useListFilters<
  T extends BaseListFilters = BaseListFilters,
>(defaults: Partial<T> = {}, options: Options = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ignoredKeys = options.ignoredFilterKeys ?? DEFAULT_IGNORED;

  const filters = useMemo<T>(() => {
    const obj = { ...defaults } as Record<string, unknown>;
    searchParams.forEach((value, key) => {
      if (key === "page") {
        const n = parseInt(value, 10);
        obj[key] = Number.isFinite(n) && n > 0 ? n : 1;
      } else {
        obj[key] = value;
      }
    });
    return obj as T;
  }, [searchParams, defaults]);

  const setFilters = useCallback(
    (updates: Partial<T>) => {
      const params = new URLSearchParams(searchParams.toString());

      for (const [key, value] of Object.entries(updates)) {
        if (
          value === undefined ||
          value === null ||
          value === "" ||
          value === false
        ) {
          params.delete(key);
        } else {
          params.set(key, String(value));
        }
      }

      // Filtre güncellemeleri sayfayı 1'e döndürür (kullanıcı "page" güncellemiyorsa)
      if (!Object.prototype.hasOwnProperty.call(updates, "page")) {
        params.delete("page");
      }

      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const clearFilters = useCallback(() => {
    router.replace(pathname, { scroll: false });
  }, [router, pathname]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    searchParams.forEach((_, key) => {
      if (!ignoredKeys.includes(key)) count++;
    });
    return count;
  }, [searchParams, ignoredKeys]);

  return { filters, setFilters, clearFilters, activeFilterCount };
}
