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
import {
  FilterSelect,
  PageHeader,
  Pagination,
  SearchInput,
} from "@/components/list";
import { Button } from "@/components/ui/button";
import { PromptDialog } from "@/components/ui/prompt-dialog";
import {
  useAdminCompanies,
  useAdminCompanyStats,
  useCompanyAction,
  useSetCompanyTier,
  type AdminCompanyListResponse,
  type AdminCompanyRow,
} from "@/hooks/use-admin-companies";
import { api } from "@/lib/api";
import { Download } from "lucide-react";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { useListFilters } from "@/hooks/use-list-filters";
import { countryFlag, countryName } from "@/lib/country";
import { safeFormat } from "@/lib/date";
import Link from "next/link";
import { Suspense, useState } from "react";
import { toast } from "sonner";

import { VERIFY_META } from "@/lib/terms";

const PAGE_SIZE = 25;

/**
 * Filtreli TÜM sonucu sayfa sayfa çekip CSV indir (tavan 2000 kayıt —
 * sunucu pageSize=100 sınırıyla 20 istek).
 */
async function exportCsv(params: Record<string, string | undefined>) {
  const rows: AdminCompanyRow[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data } = await api.get<AdminCompanyListResponse>(
      "/admin/companies",
      { params: { ...params, page, pageSize: 100 } },
    );
    rows.push(...data.items);
    if (page * 100 >= data.total) break;
  }
  const esc = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  const header = ["Firma", "Kod", "Vergi No", "Ülke", "Bölge/Şehir", "Üyelik", "Üyelik Bitişi", "Doğrulama", "Askıda", "Şikayet", "Kullanıcı", "Kayıt"];
  const lines = rows.map((c) =>
    [
      c.name,
      c.rothernId ?? "",
      c.taxNumber ?? "",
      c.country,
      [c.stateRegion, c.city].filter(Boolean).join(" / "),
      c.tier === "PAKET" ? "Premium" : "Standart",
      c.membershipEndAt ? safeFormat(c.membershipEndAt, "yyyy-MM-dd") : "",
      VERIFY_META[c.verification]?.label ?? c.verification,
      c.isBlocked ? "Evet" : "",
      c.complaintCount,
      c.userCount,
      safeFormat(c.createdAt, "yyyy-MM-dd"),
    ]
      .map(esc)
      .join(";"),
  );
  const blob = new Blob(["﻿" + [header.join(";"), ...lines].join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `firmalar-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  return rows.length;
}

interface Filters {
  status?: string;
  country?: string;
  tier?: string;
  blocked?: string;
  search?: string;
  page?: number;
  [key: string]: string | number | boolean | undefined;
}

function FirmalarView() {
  const { filters, setFilters } = useListFilters<Filters>();
  // SUPPORT salt-okuma: yazma aksiyonları + PII'lı detay linki gizlenir
  // (BE guard asıl sınır; bu UX — 403 ekranına düşmesin).
  const { admin } = useAdminAuth();
  const canWrite = admin?.role !== "SUPPORT";
  const query = useAdminCompanies({
    status: filters.status || undefined,
    country: filters.country || undefined,
    tier: filters.tier || undefined,
    blocked: filters.blocked || undefined,
    q: filters.search?.trim() || undefined,
    page: filters.page ?? 1,
    pageSize: PAGE_SIZE,
  });
  // Ülke filtresi seçenekleri gerçek veriden (stats countryBreakdown).
  const stats = useAdminCompanyStats();
  const act = useCompanyAction();
  const tierAct = useSetCompanyTier();
  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const page = query.data?.page ?? filters.page ?? 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const [prompt, setPrompt] = useState<
    | { kind: "tierMonths"; id: string }
    | { kind: "suspendReason"; id: string }
    | null
  >(null);

  const runTier = (id: string, tier: "STANDARD" | "PAKET", months?: number) =>
    tierAct.mutate(
      { id, tier, months },
      {
        onSuccess: () =>
          toast.success(
            tier === "PAKET"
              ? "Premium üyelik tanımlandı"
              : "Standart üyeliğe alındı",
          ),
        onError: (e: unknown) =>
          toast.error(e instanceof Error ? e.message : "Hata"),
      },
    );

  const runAction = (
    id: string,
    action: "suspend" | "unsuspend",
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

  return (
    <div className="max-w-[1280px] space-y-6">
      <PageHeader
        title="Firmalar"
        description="Firma hesapları — inceleme, doğrulama, üyelik ve askı yönetimi."
      />

      <div className="flex flex-wrap items-center gap-3">
        <FilterSelect
          ariaLabel="Doğrulama"
          value={filters.status ?? ""}
          active={!!filters.status}
          onChange={(v) => setFilters({ status: v })}
          options={[
            { value: "", label: "Tüm durumlar" },
            { value: "UNVERIFIED", label: "Doğrulanmadı" },
            { value: "PENDING", label: "İnceleme Bekliyor" },
            { value: "VERIFIED", label: "Doğrulandı" },
            { value: "REJECTED", label: "Reddedildi" },
          ]}
        />
        <FilterSelect
          ariaLabel="Ülke"
          value={filters.country ?? ""}
          active={!!filters.country}
          onChange={(v) => setFilters({ country: v })}
          options={[
            { value: "", label: "Tüm ülkeler" },
            ...(stats.data?.countryBreakdown ?? []).map((c) => ({
              value: c.country,
              label: `${countryFlag(c.country)} ${countryName(c.country)} (${c.count})`,
            })),
          ]}
        />
        <FilterSelect
          ariaLabel="Üyelik"
          value={filters.tier ?? ""}
          active={!!filters.tier}
          onChange={(v) => setFilters({ tier: v })}
          options={[
            { value: "", label: "Tüm üyelikler" },
            { value: "PAKET", label: "Premium" },
            { value: "STANDARD", label: "Standart" },
          ]}
        />
        <FilterSelect
          ariaLabel="Askı"
          value={filters.blocked ?? ""}
          active={!!filters.blocked}
          onChange={(v) => setFilters({ blocked: v })}
          options={[
            { value: "", label: "Hepsi" },
            { value: "true", label: "Askıda" },
          ]}
        />
        <SearchInput
          value={filters.search ?? ""}
          onChange={(v) => setFilters({ search: v })}
          placeholder="Ad / kod / vergi no / kullanıcı e-postası ara..."
        />
        <Button
          variant="secondary"
          size="sm"
          disabled={total === 0}
          onClick={() => {
            void exportCsv({
              status: filters.status || undefined,
              country: filters.country || undefined,
              tier: filters.tier || undefined,
              blocked: filters.blocked || undefined,
              q: filters.search?.trim() || undefined,
            }).then((n) => toast.success(`${n} firma CSV'ye aktarıldı`));
          }}
        >
          <Download className="mr-1.5 h-3.5 w-3.5" /> CSV
        </Button>
      </div>

      <div className="admin-card overflow-hidden">
        <Table dense>
          <TableHead>
            <TableRow>
              <TableHeader>Firma</TableHeader>
              <TableHeader>Kod</TableHeader>
              <TableHeader>Ülke</TableHeader>
              <TableHeader>Üyelik</TableHeader>
              <TableHeader>Doğrulama</TableHeader>
              <TableHeader>Şikayet</TableHeader>
              <TableHeader>Kayıt</TableHeader>
              <TableHeader className="text-right">İşlemler</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
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
                return (
                  <TableRow key={c.id}>
                    <TableCell className="text-admin-text font-medium">
                      <Link
                        href={`/admin/firmalar/${c.id}`}
                        className="hover:underline"
                      >
                        {c.name}
                      </Link>
                      {c.isBlocked ? (
                        <Badge color="red" className="ml-2">
                          Askıda
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-admin-text-muted font-mono text-xs">
                      {c.rothernId ?? "—"}
                    </TableCell>
                    <TableCell
                      className="text-admin-text text-sm whitespace-nowrap"
                      title={[countryName(c.country), c.stateRegion, c.city]
                        .filter(Boolean)
                        .join(" / ")}
                    >
                      {countryFlag(c.country)} {c.country}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge color={c.tier === "PAKET" ? "amber" : "zinc"}>
                        {c.tier === "PAKET" ? "Premium" : "Standart"}
                      </Badge>
                      {c.tier === "PAKET" && c.membershipEndAt ? (
                        <span className="text-admin-text-muted ml-1.5 text-xs">
                          → {safeFormat(c.membershipEndAt, "d MMM yy")}
                        </span>
                      ) : null}
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
                      {!canWrite ? null : (
                      <div className="flex items-center justify-end gap-2">
                        {c.tier === "PAKET" ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={tierAct.isPending}
                            onClick={() => runTier(c.id, "STANDARD")}
                          >
                            Premium'u Kaldır
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={tierAct.isPending}
                            onClick={() => setPrompt({ kind: "tierMonths", id: c.id })}
                          >
                            Premium Tanımla
                          </Button>
                        )}
                        <Link
                          href={`/admin/firmalar/${c.id}`}
                          className="inline-flex items-center rounded-lg bg-zinc-900 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-zinc-700"
                        >
                          İncele
                        </Link>
                        {c.isBlocked ? (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={act.isPending}
                            onClick={() =>
                              runAction(c.id, "unsuspend", "Askı kaldırıldı")
                            }
                          >
                            Askıyı Kaldır
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            disabled={act.isPending}
                            onClick={() =>
                              setPrompt({ kind: "suspendReason", id: c.id })
                            }
                          >
                            Askıya Al
                          </Button>
                        )}
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
          pageSize={PAGE_SIZE}
          onPageChange={(p) => setFilters({ page: p })}
        />
      </div>

      <PromptDialog
        open={prompt?.kind === "tierMonths"}
        title="Premium Üyelik Tanımla"
        label="Kaç ay premium verilsin?"
        type="number"
        min={1}
        defaultValue="12"
        required
        confirmLabel="Tanımla"
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
      {/* useSearchParams (URL-senkron filtreler) Suspense sınırı ister. */}
      <Suspense fallback={null}>
        <FirmalarView />
      </Suspense>
    </AdminShell>
  );
}
