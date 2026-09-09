"use client";

import { QuickRequest } from "@/components/tenders/quick/quick-request";
import { PageContainer } from "@/components/list/page-container";
import { PageHeader } from "@/components/list/page-header";
import type { TenderFormData } from "@/lib/tenders/form-schema";
import { PRODUCT_SEED_KEY, mapProductToForm, type ProductSeed } from "@/lib/tenders/map-product-to-form";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * YENİ TALEP — varsayılan giriş HIZLI KART (2026-09-09).
 *
 * Kopya (`?from=`), AI belge (`?ai=1`) ve şablon (`?template=`) girişleri
 * dolu bir sihirbaz ister → `detayli`ye yönlendirilir. Ürün sayfasından
 * "talebime ekle" (`?urun=1`) hızlı karta kalem olarak düşer.
 */
export default function YeniTalepPage() {
  const params = useSearchParams();
  const router = useRouter();
  const fromProduct = params.get("urun") === "1";
  const wantsDetailed = !!params.get("from") || params.get("ai") === "1" || !!params.get("template") || params.get("mod") === "detayli";
  const [seed, setSeed] = useState<Partial<TenderFormData> | null | undefined>(undefined);

  useEffect(() => {
    if (wantsDetailed) {
      router.replace(`/company/satinalma/taleplerim/yeni/detayli?${params.toString()}`);
      return;
    }
    if (!fromProduct) {
      setSeed(null);
      return;
    }
    const raw = sessionStorage.getItem(PRODUCT_SEED_KEY);
    if (raw) {
      try {
        setSeed(mapProductToForm(JSON.parse(raw) as ProductSeed));
      } catch {
        setSeed(null);
      }
      sessionStorage.removeItem(PRODUCT_SEED_KEY);
    } else setSeed(null);
  }, [wantsDetailed, fromProduct, params, router]);

  if (wantsDetailed || seed === undefined) return null;

  return (
    <PageContainer>
      <PageHeader
        title="Yeni satın alma talebi"
        description="Ne lazım, nereye, ne zamana, kime — dört soru; ticari şartlar profilinizden gelir."
        action={
          <Link href="/company/satinalma/taleplerim/yeni/detayli?mod=detayli" className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50">
            Detaylı sihirbaz
          </Link>
        }
      />
      <div className="mt-6">
        <QuickRequest key={fromProduct ? "product" : "blank"} initialValues={seed ?? undefined} />
      </div>
    </PageContainer>
  );
}
