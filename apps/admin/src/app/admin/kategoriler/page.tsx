"use client";

import { Badge } from "@/components/catalyst/badge";
import { AdminShell } from "@/components/layout/admin-shell";
import { PageHeader, SearchInput } from "@/components/list";
import { api } from "@/lib/api";
import { canAdminDo } from "@/lib/admin-permissions";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronRight, FolderTree, SearchX } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface SearchMiss {
  id: string;
  query: string;
  rawQuery: string;
  count: number;
  lastSeenAt: string;
}

/**
 * KÜRASYON KUYRUĞU — kullanıcıların arayıp BULAMADIĞI terimler.
 *
 * Taksonominin nerede eksik olduğunu söyleyen tek doğrudan sinyal budur:
 * biri bir şey aradı, karşılığı yoktu. İki olası düzeltme var — eşanlamlı
 * eklemek (`category-keywords.tsv`) ya da kategori açmak
 * (`categories-custom.tsv`). Hangisi olduğuna bakan kişi karar verir; not
 * ZORUNLU ki aynı terim tekrar geldiğinde iş baştan yapılmasın.
 */
function CurationQueue() {
  const qc = useQueryClient();
  // Backend @RequireAdminRole("SUPER_ADMIN","SALES") — buton kapısı onunla
  // BİREBİR (matris `admin-permissions.ts`, drift nöbetçisi API unit spec'inde).
  // Kapısız bırakılırsa SUPPORT butonu görür ve tıklayınca 403 alır.
  const { admin } = useAdminAuth();
  const canResolve = canAdminDo(admin?.role, "resolveCategoryMiss");
  const [note, setNote] = useState<Record<string, string>>({});

  const misses = useQuery({
    queryKey: ["admin-category-misses"],
    queryFn: async () => {
      const { data } = await api.get<SearchMiss[]>(
        "/admin/system/category-misses",
        { params: { limit: 50 } },
      );
      return data;
    },
    staleTime: 30_000,
  });

  const resolve = useMutation({
    mutationFn: async ({ id, text }: { id: string; text: string }) => {
      await api.post(`/admin/system/category-misses/${id}/resolve`, {
        note: text,
      });
    },
    onSuccess: () => {
      toast.success("Ele alındı olarak işaretlendi");
      void qc.invalidateQueries({ queryKey: ["admin-category-misses"] });
    },
    onError: () => toast.error("İşaretlenemedi"),
  });

  const rows = misses.data ?? [];
  if (misses.isLoading || rows.length === 0) return null;

  return (
    <div className="admin-card px-5 py-4">
      <div className="flex items-center gap-2">
        <SearchX className="h-4 w-4 text-amber-600" aria-hidden="true" />
        <p className="text-admin-text text-sm font-bold">
          Bulunamayan aramalar
        </p>
        <Badge color="amber">{rows.length}</Badge>
      </div>
      <p className="text-admin-text-muted mt-1 text-xs">
        Kullanıcılar bunları aradı, karşılığı çıkmadı. Ya eşanlamlı ya
        kategori eksik. Ele aldıktan sonra ne yaptığınızı yazıp işaretleyin —
        terim yeniden aranırsa kuyruğa geri döner.
      </p>
      <ul className="mt-3 divide-y divide-zinc-950/5">
        {rows.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-2 py-2">
            <span className="text-admin-text text-sm font-medium">
              {m.rawQuery}
            </span>
            <Badge color="zinc">{m.count}×</Badge>
            <input
              value={note[m.id] ?? ""}
              onChange={(e) =>
                setNote((n) => ({ ...n, [m.id]: e.target.value }))
              }
              placeholder="Ne yapıldı? (ör. eşanlamlı eklendi)"
              className="ml-auto w-64 rounded-md border border-zinc-950/10 px-2 py-1 text-sm"
            />
            <button
              type="button"
              disabled={
                !canResolve || !note[m.id]?.trim() || resolve.isPending
              }
              onClick={() =>
                resolve.mutate({ id: m.id, text: note[m.id]!.trim() })
              }
              className="inline-flex items-center gap-1 rounded-md bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-40"
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              İşaretle
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

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

      <CurationQueue />

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
