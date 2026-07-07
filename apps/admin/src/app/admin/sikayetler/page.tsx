"use client";

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
import { FilterSelect, PageHeader } from "@/components/list";
import { Button } from "@/components/ui/button";
import { PromptDialog } from "@/components/ui/prompt-dialog";
import {
  useAdminComplaints,
  useResolveComplaint,
  type AdminComplaint,
} from "@/hooks/use-admin-companies";
import { safeFormat } from "@/lib/date";
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

function SikayetlerView() {
  const [status, setStatus] = useState("OPEN");
  const query = useAdminComplaints(status || undefined);
  const resolve = useResolveComplaint();
  const items = query.data ?? [];

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
          onChange={setStatus}
          options={[
            { value: "", label: "Tümü" },
            { value: "OPEN", label: "Açık" },
            { value: "RESOLVED", label: "Çözüldü" },
            { value: "DISMISSED", label: "Reddedildi" },
          ]}
        />
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
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-admin-text-muted py-8 text-center"
                >
                  {query.isError
                    ? "Veri alınamadı — lütfen tekrar deneyin"
                    : query.isLoading
                      ? "Yükleniyor..."
                      : "Şikayet bulunamadı"}
                </TableCell>
              </TableRow>
            ) : (
              items.map((c: AdminComplaint) => {
                const meta = STATUS_META[c.status] ?? STATUS_META.OPEN;
                const pending = resolve.isPending;
                return (
                  <TableRow key={c.id}>
                    <TableCell className="text-admin-text">
                      {c.complainant.name}
                    </TableCell>
                    <TableCell className="text-admin-text font-medium">
                      {c.against.name}
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
