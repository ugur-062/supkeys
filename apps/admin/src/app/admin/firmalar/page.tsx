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
import { FilterSelect, PageHeader, SearchInput } from "@/components/list";
import { Button } from "@/components/ui/button";
import { PromptDialog } from "@/components/ui/prompt-dialog";
import {
  useAdminCompanies,
  useCompanyAction,
  useSetCompanyTier,
  type AdminCompanyRow,
} from "@/hooks/use-admin-companies";
import { safeFormat } from "@/lib/date";
import { useState } from "react";
import { toast } from "sonner";

const VERIFY_META: Record<
  string,
  { label: string; color: "green" | "amber" | "red" | "zinc" }
> = {
  VERIFIED: { label: "Doğrulandı", color: "green" },
  PENDING: { label: "Beklemede", color: "amber" },
  REJECTED: { label: "Reddedildi", color: "red" },
  UNVERIFIED: { label: "Doğrulanmadı", color: "zinc" },
};

function FirmalarView() {
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const query = useAdminCompanies({
    status: status || undefined,
    q: q.trim() || undefined,
  });
  const act = useCompanyAction();
  const tierAct = useSetCompanyTier();
  const items = query.data ?? [];

  // window.prompt yerine erişilebilir/test edilebilir modal — girdi gerektiren
  // aksiyonlar (PAKET ay sayısı, askı sebebi) bunu açar.
  const [prompt, setPrompt] = useState<
    | { kind: "tierMonths"; id: string }
    | { kind: "suspendReason"; id: string }
    | null
  >(null);

  const runTier = (
    id: string,
    tier: "STANDARD" | "PAKET",
    months?: number,
  ) =>
    tierAct.mutate(
      { id, tier, months },
      {
        onSuccess: () =>
          toast.success(tier === "PAKET" ? "PAKET verildi" : "Standart'a alındı"),
        onError: (e: unknown) =>
          toast.error(e instanceof Error ? e.message : "Hata"),
      },
    );

  const runAction = (
    id: string,
    action: "verify" | "reject" | "suspend" | "unsuspend",
    msg: string,
    reason?: string,
  ) =>
    act.mutate(
      { id, action, reason },
      {
        onSuccess: () => toast.success(msg),
        onError: (e: unknown) =>
          toast.error(e instanceof Error ? e.message : "Hata"),
      },
    );

  const setTier = (id: string, tier: "STANDARD" | "PAKET") => {
    if (tier === "PAKET") {
      setPrompt({ kind: "tierMonths", id });
      return;
    }
    runTier(id, tier);
  };

  const run = (
    id: string,
    action: "verify" | "reject" | "suspend" | "unsuspend",
    msg: string,
  ) => {
    if (action === "suspend") {
      setPrompt({ kind: "suspendReason", id });
      return;
    }
    runAction(id, action, msg);
  };

  return (
    <div className="max-w-[1200px] space-y-6">
      <PageHeader
        title="Firmalar"
        description="Birleşik firma hesapları — KYC doğrulama ve askıya alma."
      />

      <div className="flex flex-wrap items-center gap-3">
        <FilterSelect
          ariaLabel="Doğrulama"
          value={status}
          active={!!status}
          onChange={setStatus}
          options={[
            { value: "", label: "Tüm durumlar" },
            { value: "UNVERIFIED", label: "Doğrulanmadı" },
            { value: "PENDING", label: "Beklemede" },
            { value: "VERIFIED", label: "Doğrulandı" },
            { value: "REJECTED", label: "Reddedildi" },
          ]}
        />
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder="Firma adı / kod / vergi no ara..."
        />
      </div>

      <div className="admin-card overflow-hidden">
        <Table dense>
          <TableHead>
            <TableRow>
              <TableHeader>Firma</TableHeader>
              <TableHeader>Kod</TableHeader>
              <TableHeader>Üyelik</TableHeader>
              <TableHeader>KYC</TableHeader>
              <TableHeader>Şikayet</TableHeader>
              <TableHeader>Kayıt</TableHeader>
              <TableHeader className="text-right">İşlemler</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-admin-text-muted py-8 text-center"
                >
                  {query.isError
                    ? "Veri alınamadı — lütfen tekrar deneyin"
                    : query.isLoading
                      ? "Yükleniyor..."
                      : "Firma bulunamadı"}
                </TableCell>
              </TableRow>
            ) : (
              items.map((c: AdminCompanyRow) => {
                const meta = VERIFY_META[c.verification] ?? VERIFY_META.UNVERIFIED;
                const pending = act.isPending;
                return (
                  <TableRow key={c.id}>
                    <TableCell className="text-admin-text font-medium">
                      {c.name}
                      {c.isBlocked ? (
                        <Badge color="red" className="ml-2">
                          Askıda
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-admin-text-muted font-mono text-xs">
                      {c.supkeysId ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge color={c.tier === "PAKET" ? "amber" : "zinc"}>
                        {c.tier === "PAKET" ? "Premium" : "Standart"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge color={meta.color}>{meta.label}</Badge>
                    </TableCell>
                    <TableCell className="text-admin-text">
                      {c.complaintCount > 0 ? (
                        <Badge color="red">{c.complaintCount}</Badge>
                      ) : (
                        <span className="text-admin-text-muted">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-admin-text-muted text-xs whitespace-nowrap">
                      {safeFormat(c.createdAt, "d MMM yyyy")}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        {c.tier === "PAKET" ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={tierAct.isPending}
                            onClick={() => setTier(c.id, "STANDARD")}
                          >
                            PAKET Al
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={tierAct.isPending}
                            onClick={() => setTier(c.id, "PAKET")}
                          >
                            PAKET Ver
                          </Button>
                        )}
                        {c.verification !== "VERIFIED" ? (
                          <Button
                            type="button"
                            size="sm"
                            disabled={pending}
                            onClick={() => run(c.id, "verify", "Doğrulandı")}
                          >
                            Doğrula
                          </Button>
                        ) : null}
                        {c.verification !== "REJECTED" ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={pending}
                            onClick={() => run(c.id, "reject", "Reddedildi")}
                          >
                            Reddet
                          </Button>
                        ) : null}
                        {c.isBlocked ? (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={pending}
                            onClick={() =>
                              run(c.id, "unsuspend", "Askı kaldırıldı")
                            }
                          >
                            Askıyı Kaldır
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            disabled={pending}
                            onClick={() => run(c.id, "suspend", "Askıya alındı")}
                          >
                            Askıya Al
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <PromptDialog
        open={prompt?.kind === "tierMonths"}
        title="Premium (PAKET) Ver"
        label="Kaç ay premium verilsin?"
        type="number"
        min={1}
        defaultValue="12"
        required
        confirmLabel="PAKET Ver"
        onConfirm={(v) => {
          if (prompt?.kind !== "tierMonths") return;
          const n = Math.floor(Number(v));
          runTier(prompt.id, "PAKET", n >= 1 ? n : 12);
          setPrompt(null);
        }}
        onClose={() => setPrompt(null)}
      />
      <PromptDialog
        open={prompt?.kind === "suspendReason"}
        title="Firmayı Askıya Al"
        label="Askı sebebi (opsiyonel)"
        placeholder="Örn. tekrarlanan şikayet"
        confirmLabel="Askıya Al"
        onConfirm={(v) => {
          if (prompt?.kind !== "suspendReason") return;
          runAction(prompt.id, "suspend", "Askıya alındı", v || undefined);
          setPrompt(null);
        }}
        onClose={() => setPrompt(null)}
      />
    </div>
  );
}

export default function AdminFirmalarPage() {
  return (
    <AdminShell>
      <FirmalarView />
    </AdminShell>
  );
}
