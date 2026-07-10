"use client";

import { Badge } from "@/components/catalyst/badge";
import { AdminShell } from "@/components/layout/admin-shell";
import { PageHeader, SearchInput } from "@/components/list";
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, FolderTree } from "lucide-react";
import { useEffect, useState } from "react";

interface CommodityNode {
  id: string;
  code: string;
  nameTr: string;
  level: number;
  isMatch: boolean;
}
interface ClassNode extends CommodityNode {
  commodities: CommodityNode[];
}
interface FamilyNode {
  id: string;
  code: string;
  nameTr: string;
  level: number;
  classes: ClassNode[];
}
interface SegmentNode {
  id: string;
  code: string;
  nameTr: string;
  level: number;
  segmentLetter: string | null;
  families: FamilyNode[];
}

/**
 * UNSPSC kategori tarayıcı — 13.305 kategoriyi ara/incele (UNGM TR).
 * Public /categories/search-tree endpoint'ini kullanır; salt-okuma.
 */
function KategorilerView() {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const query = useQuery({
    queryKey: ["admin-category-search", debounced],
    enabled: debounced.trim().length >= 2,
    queryFn: async () => {
      const { data } = await api.get<{ segments: SegmentNode[] }>(
        "/categories/search-tree",
        { params: { q: debounced } },
      );
      return data;
    },
    staleTime: 60_000,
  });

  const segments = query.data?.segments ?? [];

  return (
    <div className="max-w-[900px] space-y-6">
      <PageHeader
        title="Kategoriler"
        description="UNSPSC taksonomisi (UNGM TR) — kod veya ada göre ara; hiyerarşi koddan türetilir."
      />

      <SearchInput
        value={q}
        onChange={setQ}
        placeholder="Kategori adı veya 8 haneli kod ara (en az 2 karakter)..."
      />

      {debounced.trim().length < 2 ? (
        <div className="admin-card text-admin-text-muted flex flex-col items-center gap-2 px-6 py-16 text-center text-sm">
          <FolderTree className="h-7 w-7" aria-hidden="true" />
          Aramak için en az 2 karakter yazın — ör. &quot;çelik&quot;,
          &quot;yazılım&quot;, &quot;43230000&quot;.
        </div>
      ) : query.isLoading ? (
        <p className="text-admin-text-muted text-sm">Aranıyor...</p>
      ) : query.isError ? (
        <div className="admin-card text-admin-text-muted px-6 py-10 text-center text-sm">
          Kategoriler yüklenemedi —{" "}
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="font-semibold text-blue-600 hover:underline"
          >
            tekrar deneyin
          </button>
        </div>
      ) : segments.length === 0 ? (
        <div className="admin-card text-admin-text-muted px-6 py-10 text-center text-sm">
          Sonuç yok
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-admin-text-muted text-xs">
            {segments.length} segment altında sonuçlar listeleniyor.
          </p>
          {segments.map((seg) => (
            <div key={seg.id} className="admin-card px-5 py-3.5">
              <p className="text-admin-text text-sm font-bold">
                <span className="text-admin-text-muted mr-2 font-mono text-xs">
                  {seg.code}
                </span>
                {seg.nameTr}
                <Badge color="zinc" className="ml-2">
                  Segment
                </Badge>
              </p>
              {seg.families.map((fam) => (
                <div key={fam.id} className="mt-2 pl-4">
                  <p className="text-admin-text flex items-center gap-1 text-sm font-semibold">
                    <ChevronRight className="text-admin-text-muted h-3.5 w-3.5" />
                    <span className="text-admin-text-muted mr-1 font-mono text-xs">
                      {fam.code}
                    </span>
                    {fam.nameTr}
                  </p>
                  {fam.classes.map((cls) => (
                    <div key={cls.id} className="mt-1 pl-6">
                      <p
                        className={`text-sm ${cls.isMatch ? "text-admin-text font-medium" : "text-admin-text-muted"}`}
                      >
                        <span className="mr-1 font-mono text-xs">
                          {cls.code}
                        </span>
                        {cls.nameTr}
                      </p>
                      {cls.commodities.length > 0 ? (
                        <ul className="mt-0.5 pl-6">
                          {cls.commodities.map((com) => (
                            <li
                              key={com.id}
                              className={`text-xs ${com.isMatch ? "text-admin-text font-medium" : "text-admin-text-muted"}`}
                            >
                              <span className="mr-1 font-mono">{com.code}</span>
                              {com.nameTr}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminKategorilerPage() {
  return (
    <AdminShell>
      <KategorilerView />
    </AdminShell>
  );
}
