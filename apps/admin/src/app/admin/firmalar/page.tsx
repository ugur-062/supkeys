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
import { RequireAdminAuth } from "@/components/providers/auth-hydration";
import { Button } from "@/components/ui/button";
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

  const setTier = (id: string, tier: "STANDARD" | "PAKET") => {
    let months: number | undefined;
    if (tier === "PAKET") {
      const m = window.prompt("Kaç ay premium verilsin?", "12");
      if (m === null) return;
      months = Number(m) || 12;
    }
    tierAct.mutate(
      { id, tier, months },
      {
        onSuccess: () =>
          toast.success(tier === "PAKET" ? "PAKET verildi" : "Standart'a alındı"),
        onError: (e: unknown) =>
          toast.error(e instanceof Error ? e.message : "Hata"),
      },
    );
  };

  const run = (
    id: string,
    action: "verify" | "reject" | "suspend" | "unsuspend",
    msg: string,
  ) => {
    let reason: string | undefined;
    if (action === "suspend") {
      reason = window.prompt("Askı sebebi (opsiyonel):") ?? undefined;
    }
    act.mutate(
      { id, action, reason },
      {
        onSuccess: () => toast.success(msg),
        onError: (e: unknown) =>
          toast.error(e instanceof Error ? e.message : "Hata"),
      },
    );
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
                  {query.isLoading ? "Yükleniyor..." : "Firma bulunamadı"}
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
    </div>
  );
}

export default function AdminFirmalarPage() {
  return (
    <RequireAdminAuth>
      <AdminShell>
        <FirmalarView />
      </AdminShell>
    </RequireAdminAuth>
  );
}
