"use client";

import { TableStateRow } from "@/components/list/table-state";
import { Badge } from "@/components/catalyst/badge";
import {
  Dropdown,
  DropdownButton,
  DropdownDivider,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from "@/components/catalyst/dropdown";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/catalyst/table";
import { AdminShell } from "@/components/layout/admin-shell";
import { AdminRoleGate } from "@/components/layout/admin-role-gate";
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
import { api, toastApiError } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";
import { Download, EllipsisVertical } from "lucide-react";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { canAdminDo } from "@/lib/admin-permissions";
import { useListFilters } from "@/hooks/use-list-filters";
import { countryFlag, countryName, countryShort } from "@/lib/country";
import { safeFormat, toDateInput } from "@/lib/date";
import Link from "next/link";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import {
  remainingSentence,
  revokeNotice,
  tierGrantWarnings,
} from "./[id]/_components/tier-warnings";

import {
  PAID_TIER_OPTIONS,
  TIER_COLOR,
  TIER_LABEL,
  VERIFY_META,
} from "@/lib/terms";

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
    if (page === 1 && data.total > 2000) {
      toast.warning(
        `Sonuç ${data.total.toLocaleString("tr-TR")} kayıt — CSV ilk 2000 ile sınırlı`,
      );
    }
    if (page * 100 >= data.total) break;
  }
  downloadCsv(
    `firmalar-${toDateInput()}.csv`, // yerel gün (D-142)
    ["Firma", "Kod", "Vergi No", "Ülke", "Bölge/Şehir", "Üyelik", "Üyelik Bitişi", "Doğrulama", "Askıda", "Şikayet", "Kullanıcı", "Kayıt"],
    rows.map((c) => [
      c.name,
      c.rothernId ?? "",
      c.taxNumber ?? "",
      c.country,
      [c.stateRegion, c.city].filter(Boolean).join(" / "),
      TIER_LABEL[c.tier] ?? c.tier,
      c.membershipEndAt ? safeFormat(c.membershipEndAt, "yyyy-MM-dd") : "",
      VERIFY_META[c.verification]?.label ?? c.verification,
      c.isBlocked ? "Evet" : "",
      c.complaintCount,
      c.userCount,
      safeFormat(c.createdAt, "yyyy-MM-dd"),
    ]),
  );
  return rows.length;
}

interface Filters {
  status?: string;
  country?: string;
  tier?: string;
  blocked?: string;
  /** "30" → 30 gün içinde bitecek paket üyelikler (pano bağlantısı, D-146). */
  expiring?: string;
  search?: string;
  page?: number;
  [key: string]: string | number | boolean | undefined;
}

function FirmalarView() {
  const { filters, setFilters } = useListFilters<Filters>();
  // Rol-farkında kapı (F7, canAdminDo — backend @RequireAdminRole ile birebir).
  // Bu liste zaten SUPER_ADMIN/SALES'e açık (GET companies gated); İncele ikisine
  // de görünür, Premium/Askı menüsü yalnız SUPER_ADMIN'e (setTier/suspend SUPER).
  const { admin } = useAdminAuth();
  const role = admin?.role;
  const canWrite = role !== "SUPPORT";
  const query = useAdminCompanies({
    status: filters.status || undefined,
    country: filters.country || undefined,
    tier: filters.tier || undefined,
    blocked: filters.blocked || undefined,
    expiring: filters.expiring === "30" ? "30" : undefined,
    q: filters.search?.trim() || undefined,
    page: filters.page ?? 1,
    pageSize: PAGE_SIZE,
  });
  // Ülke filtresi seçenekleri gerçek veriden (stats countryOptions — tüm ülkeler).
  const stats = useAdminCompanyStats();
  const act = useCompanyAction();
  const tierAct = useSetCompanyTier();
  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const page = query.data?.page ?? filters.page ?? 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // CSV dışa aktarımı sürerken buton kilitli (çift tık paralel dizi başlatıp
  // birden çok dosya indirmesin); hata yakalanır (derin denetim LU-12).
  const [exporting, setExporting] = useState(false);
  const runExport = async () => {
    setExporting(true);
    try {
      const n = await exportCsv({
        status: filters.status || undefined,
        country: filters.country || undefined,
        tier: filters.tier || undefined,
        blocked: filters.blocked || undefined,
        expiring: filters.expiring === "30" ? "30" : undefined,
        q: filters.search?.trim() || undefined,
      });
      toast.success(`${n} firma CSV'ye aktarıldı`);
    } catch (e) {
      toastApiError(e, "CSV alınamadı");
    } finally {
      setExporting(false);
    }
  };

  const [prompt, setPrompt] = useState<
    | { kind: "tierMonths"; row: AdminCompanyRow; tier: "SILVER" | "GOLD" }
    | { kind: "revoke"; row: AdminCompanyRow }
    | { kind: "suspendReason"; id: string }
    | null
  >(null);

  // Promise döner: diyalog yalnız başarıda kapanır (hata dalında girilen
  // değer kaybolmaz) ve onay düğmesi iş bitene dek kilitli kalır.
  const runTier = (
    id: string,
    tier: "STANDART" | "SILVER" | "GOLD",
    months?: number,
    reason?: string,
  ) =>
    tierAct.mutateAsync({ id, tier, months, reason }).then(
      () => {
        toast.success(
          tier !== "STANDART"
            ? `${TIER_LABEL[tier]} paketi tanımlandı`
            : "Paket kaldırıldı (Standart)",
        );
        setPrompt(null);
      },
      (e: unknown) => toastApiError(e),
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
        onError: (e: unknown) => toastApiError(e),
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
            ...(
              stats.data?.countryOptions ??
              stats.data?.countryBreakdown ??
              []
            ).map((c) => ({
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
            { value: "GOLD", label: "Gold" },
            { value: "SILVER", label: "Silver" },
            { value: "STANDART", label: "Standart" },
          ]}
        />
        <FilterSelect
          ariaLabel="Üyelik bitişi"
          value={filters.expiring === "30" ? "30" : ""}
          active={filters.expiring === "30"}
          onChange={(v) => setFilters({ expiring: v })}
          options={[
            { value: "", label: "Tüm bitiş tarihleri" },
            { value: "30", label: "30 gün içinde bitecek" },
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
          disabled={total === 0 || exporting}
          loading={exporting}
          onClick={() => void runExport()}
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
              <TableStateRow
                colSpan={8}
                loading={query.isLoading}
                error={query.isError}
                onRetry={() => void query.refetch()}
                empty="Firma bulunamadı"
              />
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
                      {countryFlag(c.country)} {countryShort(c.country)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge color={TIER_COLOR[c.tier] ?? "zinc"}>
                        {TIER_LABEL[c.tier] ?? c.tier}
                      </Badge>
                      {c.tier !== "STANDART" && c.membershipEndAt ? (
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
                      {/* Tek ana aksiyon (İncele) + ikincil işlemler ⋯ menüde
                          — satır buton kalabalığı yerine müşteri paneli deseni. */}
                      {!canWrite ? null : (
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            href={`/admin/firmalar/${c.id}`}
                            className="inline-flex items-center rounded-lg bg-zinc-900 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-zinc-700"
                          >
                            İncele
                          </Link>
                          {/* KVKK ile anonimleştirilmiş firmada paket/askı
                              işlemi yok (D-208; API 409). */}
                          {canAdminDo(role, "setTier") && !c.anonymized ? (
                          <Dropdown>
                            <DropdownButton
                              plain
                              aria-label={`${c.name} işlemleri`}
                              className="!px-1.5"
                            >
                              <EllipsisVertical className="size-4 text-zinc-500" />
                            </DropdownButton>
                            <DropdownMenu anchor="bottom end">
                              {PAID_TIER_OPTIONS.map((t) => (
                                <DropdownItem
                                  key={t}
                                  onClick={() =>
                                    setPrompt({
                                      kind: "tierMonths",
                                      row: c,
                                      tier: t,
                                    })
                                  }
                                >
                                  <DropdownLabel>
                                    {TIER_LABEL[t]} Tanımla
                                  </DropdownLabel>
                                </DropdownItem>
                              ))}
                              {/* Detaydaki Üyelik sekmesiyle aynı: gerekçeli
                                  onay penceresi (arayüz testi O-046). */}
                              {c.tier !== "STANDART" ? (
                                <DropdownItem
                                  onClick={() =>
                                    setPrompt({ kind: "revoke", row: c })
                                  }
                                >
                                  <DropdownLabel>Paketi Kaldır</DropdownLabel>
                                </DropdownItem>
                              ) : null}
                              <DropdownDivider />
                              {c.isBlocked ? (
                                <DropdownItem
                                  onClick={() =>
                                    runAction(
                                      c.id,
                                      "unsuspend",
                                      "Askı kaldırıldı",
                                    )
                                  }
                                >
                                  <DropdownLabel>Askıyı Kaldır</DropdownLabel>
                                </DropdownItem>
                              ) : (
                                <DropdownItem
                                  onClick={() =>
                                    setPrompt({
                                      kind: "suspendReason",
                                      id: c.id,
                                    })
                                  }
                                >
                                  <DropdownLabel>Askıya Al</DropdownLabel>
                                </DropdownItem>
                              )}
                            </DropdownMenu>
                          </Dropdown>
                          ) : null}
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
        title={`${prompt?.kind === "tierMonths" ? TIER_LABEL[prompt.tier] : ""} Paketi Tanımla`}
        notice={
          prompt?.kind === "tierMonths"
            ? tierWarningNotice(prompt.row, prompt.tier)
            : undefined
        }
        label="Kaç ay verilsin?"
        type="number"
        // Aralık PromptDialog'da doğrulanır (backend @Min(1) @Max(60)); dışı
        // değer sessizce 12/60'a çevrilmez (arayüz testi O-074).
        min={1}
        max={60}
        defaultValue="12"
        required
        confirmLabel="Tanımla"
        onConfirm={(v) => {
          if (prompt?.kind !== "tierMonths") return;
          return runTier(prompt.row.id, prompt.tier, Number(v));
        }}
        onClose={() => setPrompt(null)}
      />
      <PromptDialog
        open={prompt?.kind === "revoke"}
        title="Paketi Kaldır"
        notice={
          prompt?.kind === "revoke"
            ? revokeNotice(
                remainingSentence(
                  prompt.row.tier,
                  prompt.row.membershipEndAt,
                  (iso) => safeFormat(iso, "d MMMM yyyy"),
                ),
              )
            : undefined
        }
        label="Gerekçe (opsiyonel — geçmişte görünür)"
        placeholder="Örn. iade talebi"
        maxLength={500}
        confirmLabel="Kaldır"
        onConfirm={(v) => {
          if (prompt?.kind !== "revoke") return;
          return runTier(prompt.row.id, "STANDART", undefined, v || undefined);
        }}
        onClose={() => setPrompt(null)}
      />
      <PromptDialog
        open={prompt?.kind === "suspendReason"}
        title="Firmayı Askıya Al"
        label="Askı sebebi (opsiyonel)"
        placeholder="Örn. tekrarlanan şikayet"
        maxLength={500}
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

/** Satır menüsünden paket tanımlarken sonuç uyarıları (D-191). */
function tierWarningNotice(
  row: AdminCompanyRow,
  tier: "SILVER" | "GOLD",
): React.ReactNode {
  const warnings = tierGrantWarnings(
    { tier: row.tier, verification: row.verification },
    tier,
  );
  if (warnings.length === 0) return undefined;
  return (
    <div className="space-y-1">
      {warnings.map((w) => (
        <p key={w}>{w}</p>
      ))}
    </div>
  );
}

export default function AdminFirmalarPage() {
  return (
    <AdminShell>
      {/* useSearchParams (URL-senkron filtreler) Suspense sınırı ister. */}
      <AdminRoleGate action="listCompanies">
        <Suspense fallback={null}>
          <FirmalarView />
        </Suspense>
      </AdminRoleGate>
    </AdminShell>
  );
}
