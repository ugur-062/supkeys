"use client";

import { TableStateRow } from "@/components/list/table-state";
import { Badge } from "@/components/catalyst/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/catalyst/table";
import { AdminShell } from "@/components/layout/admin-shell";
import {
  FilterSelect,
  PageHeader,
  Pagination,
  SearchInput,
} from "@/components/list";
import { Button } from "@/components/ui/button";
import { PromptDialog } from "@/components/ui/prompt-dialog";
import {
  useAdminComplaints,
  useResolveComplaint,
  type AdminComplaint,
} from "@/hooks/use-admin-companies";
import { downloadCsv } from "@/lib/csv";
import { safeFormat } from "@/lib/date";
import { Download } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

const STATUS_META: Record<
  string,
  { label: string; color: "amber" | "green" | "zinc" }
> = {
  OPEN: { label: "Açık", color: "amber" },
  RESOLVED: { label: "Çözüldü", color: "green" },
  DISMISSED: { label: "Reddedildi", color: "zinc" },
};

function exportComplaintsCsv(items: AdminComplaint[]) {
  downloadCsv(
    `sikayetler-${new Date().toISOString().slice(0, 10)}.csv`,
    ["Tarih", "Şikayet Eden", "Hakkında", "Konu", "Detay", "Durum", "Yönetici Notu"],
    items.map((c) => [
      safeFormat(c.createdAt, "yyyy-MM-dd HH:mm"),
      c.complainant.name,
      c.against.name,
      c.reason,
      c.detail ?? "",
      STATUS_META[c.status]?.label ?? c.status,
      c.adminNote ?? "",
    ]),
  );
}

function SikayetlerView() {
  const [status, setStatus] = useState("OPEN");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const query = useAdminComplaints(
    status || undefined,
    undefined,
    q.trim() || undefined,
    page,
  );
  const resolve = useResolveComplaint();
  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const pageSize = query.data?.pageSize ?? 25;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // window.prompt yerine erişilebilir/test edilebilir modal — yönetici notu.
  const [prompt, setPrompt] = useState<{
    id: string;
    status: "RESOLVED" | "DISMISSED";
    suspend: boolean;
    msg: string;
  } | null>(null);

  const act = (
    id: string,
    s: "RESOLVED" | "DISMISSED",
    suspend: boolean,
    msg: string,
  ) => setPrompt({ id, status: s, suspend, msg });

  const runResolve = (adminNote?: string) => {
    if (!prompt) return;
    resolve.mutate(
      { id: prompt.id, status: prompt.status, adminNote, suspend: prompt.suspend },
      {
        onSuccess: () => toast.success(prompt.msg),
        onError: (e: unknown) =>
          toast.error(e instanceof Error ? e.message : "Hata"),
      },
    );
    setPrompt(null);
  };

  return (
    <div className="max-w-[1200px] space-y-6">
      <PageHeader
        title="Şikayetler"
        description="Firma→firma şikayetleri — incele, çöz ya da reddet; gerekirse askıya al."
      />

      <div className="flex flex-wrap items-center gap-3">
        <FilterSelect
          ariaLabel="Durum"
          value={status}
          active={!!status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={[
            { value: "", label: "Tümü" },
            { value: "OPEN", label: "Açık" },
            { value: "RESOLVED", label: "Çözüldü" },
            { value: "DISMISSED", label: "Reddedildi" },
          ]}
        />
        <SearchInput
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(1);
          }}
          placeholder="Firma adı / konu / detay ara..."
        />
        <Button
          variant="secondary"
          size="sm"
          disabled={items.length === 0}
          onClick={() => exportComplaintsCsv(items)}
        >
          <Download className="mr-1.5 h-3.5 w-3.5" /> CSV
        </Button>
      </div>

      <div className="admin-card overflow-hidden">
        <Table dense>
          <TableHead>
            <TableRow>
              <TableHeader>Şikayet Eden</TableHeader>
              <TableHeader>Hakkında</TableHeader>
              <TableHeader>Konu</TableHeader>
              <TableHeader>Durum</TableHeader>
              <TableHeader>Tarih</TableHeader>
              <TableHeader className="text-right">İşlemler</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.length === 0 ? (
              <TableStateRow
                colSpan={6}
                loading={query.isLoading}
                error={query.isError}
                onRetry={() => void query.refetch()}
                empty="Şikayet bulunamadı"
              />
            ) : (
              items.map((c: AdminComplaint) => {
                const meta = STATUS_META[c.status] ?? STATUS_META.OPEN;
                const pending = resolve.isPending;
                return (
                  <TableRow key={c.id}>
                    <TableCell className="text-admin-text">
                      <Link
                        href={`/admin/firmalar/${c.complainant.id}`}
                        className="hover:underline"
                      >
                        {c.complainant.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-admin-text font-medium">
                      <Link
                        href={`/admin/firmalar/${c.against.id}?tab=sikayetler`}
                        className="hover:underline"
                      >
                        {c.against.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-admin-text max-w-[280px]">
                      <div className="font-medium">{c.reason}</div>
                      {c.detail ? (
                        <div className="text-admin-text-muted mt-0.5 line-clamp-2 text-xs">
                          {c.detail}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge color={meta.color}>{meta.label}</Badge>
                    </TableCell>
                    <TableCell className="text-admin-text-muted text-xs whitespace-nowrap">
                      {safeFormat(c.createdAt, "d MMM yyyy")}
                    </TableCell>
                    <TableCell>
                      {c.status === "OPEN" ? (
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            disabled={pending}
                            onClick={() =>
                              act(c.id, "RESOLVED", true, "Çözüldü & askıya alındı")
                            }
                          >
                            Çöz & Askıya Al
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            disabled={pending}
                            onClick={() => act(c.id, "RESOLVED", false, "Çözüldü")}
                          >
                            Çöz
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={pending}
                            onClick={() =>
                              act(c.id, "DISMISSED", false, "Reddedildi")
                            }
                          >
                            Reddet
                          </Button>
                        </div>
                      ) : (
                        <div className="text-admin-text-muted text-right text-xs">
                          {c.adminNote ?? "—"}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={pageSize}
          onPageChange={setPage}
        />
      </div>

      <PromptDialog
        open={prompt !== null}
        title={prompt?.status === "DISMISSED" ? "Şikayeti Reddet" : "Şikayeti Çöz"}
        label="Yönetici notu (opsiyonel)"
        placeholder="Karar gerekçesi"
        confirmLabel={prompt?.msg ?? "Onayla"}
        onConfirm={(v) => runResolve(v || undefined)}
        onClose={() => setPrompt(null)}
      />
    </div>
  );
}

export default function AdminSikayetlerPage() {
  return (
    <AdminShell>
      <SikayetlerView />
    </AdminShell>
  );
}
