"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Archive, ArchiveRestore, PackageSearch } from "lucide-react";
import { toast } from "sonner";
import { companyApi } from "@/lib/company-auth/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Heading, Subheading } from "@/components/catalyst/heading";
import { Text } from "@/components/catalyst/text";
import { SearchInput } from "@/components/list";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useHasCompanyPermission } from "@/hooks/use-company-auth";
import { unitText } from "@/components/ui/unit-select";
import { extractErrorMessage } from "@/lib/tenders/error";
import {
  CATALOG_KEY,
  useCatalogItems,
  type CatalogItem,
} from "@/hooks/use-company-items";

/**
 * Kalem Kataloğu yönetimi (Faz 2).
 *
 * Bilinçli sade: liste + arama + arşivle/geri al. Kalem EKLEMENİN asıl yolu
 * ihale detayındaki "Kataloğa Kaydet" — kullanıcıdan önce oturup katalog
 * kurmasını istemek benimsemeyi öldürür. Bu ekran biriken kataloğu gözden
 * geçirmek ve temizlemek için.
 *
 * Silme YOK: arşivleme. Geçmiş ilanlar kopya taşıdığı için etkilenmez, ama
 * kullanıcı yanlışlıkla kaldırdığını geri alabilmeli.
 */
export function CatalogItemsView({ basePath }: { basePath: string }) {
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const debouncedQ = useDebouncedValue(q, 300);
  const canManage = useHasCompanyPermission("templates:manage");
  const qc = useQueryClient();

  const active = useCatalogItems(debouncedQ, !showArchived);
  const archived = useQuery<{ items: CatalogItem[]; total: number }>({
    queryKey: [...CATALOG_KEY, "archived", debouncedQ],
    queryFn: async () => {
      const { data } = await companyApi.get<{
        items: CatalogItem[];
        total: number;
      }>("/company/items", {
        params: { ...(debouncedQ ? { q: debouncedQ } : {}), archived: "1" },
      });
      return data;
    },
    enabled: showArchived,
  });

  const setActive = useMutation({
    mutationFn: async (v: { id: string; isActive: boolean }) => {
      await companyApi.patch(`/company/items/${v.id}/active`, {
        isActive: v.isActive,
      });
    },
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: CATALOG_KEY });
      toast.success(v.isActive ? "Kalem geri alındı" : "Kalem arşivlendi");
    },
    onError: (err) => toast.error(extractErrorMessage(err, "İşlem başarısız")),
  });

  const list = showArchived ? archived.data : active.data;
  const items = list?.items ?? [];

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={basePath}
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Şablonlar
        </Link>
        <Heading className="mt-2">Kalem Kataloğu</Heading>
        <Text>
          Sık kullandığınız kalemleri saklayın; ihale açarken{" "}
          <strong>Katalogdan Ekle</strong> ile saniyede listeleyin. Katalog,
          satın alma talebi detayındaki <strong>Kataloğa Kaydet</strong> ile kendiliğinden
          dolar.
        </Text>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder="Kalem adı, stok kodu, marka…"
          className="w-72"
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setShowArchived((v) => !v)}
        >
          {showArchived ? "Aktifleri göster" : "Arşivi göster"}
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 p-10 text-center">
          <PackageSearch className="mx-auto h-6 w-6 text-zinc-400" aria-hidden />
          <Subheading className="mt-2">
            {showArchived ? "Arşiv boş" : "Katalog henüz boş"}
          </Subheading>
          <Text className="mt-1">
            {showArchived
              ? "Arşivlenmiş kalem yok."
              : "Bir satın alma talebi oluşturduktan sonra kalem listesinin üstündeki “Kataloğa Kaydet” düğmesiyle doldurabilirsiniz."}
          </Text>
        </div>
      ) : (
        <ul className="divide-y divide-zinc-950/5 rounded-xl border border-zinc-950/10 bg-white">
          {items.map((it) => (
            <li key={it.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-900">
                  {it.name}
                </p>
                <p className="truncate text-xs text-zinc-500">
                  {[
                    it.code,
                    it.brand,
                    unitText(it.unitCode, it.unit),
                    it.usageCount > 0 ? `${it.usageCount} kez kullanıldı` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              {canManage ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={setActive.isPending}
                  onClick={() =>
                    setActive.mutate({ id: it.id, isActive: !it.isActive })
                  }
                >
                  {it.isActive ? (
                    <>
                      <Archive className="h-4 w-4" />
                      Arşivle
                    </>
                  ) : (
                    <>
                      <ArchiveRestore className="h-4 w-4" />
                      Geri al
                    </>
                  )}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {active.data?.truncated && !showArchived ? (
        <p role="status" className="text-xs text-amber-700">
          Liste kısaltıldı — aramayı daraltın.
        </p>
      ) : null}
    </div>
  );
}
