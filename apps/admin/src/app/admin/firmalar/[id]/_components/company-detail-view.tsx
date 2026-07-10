"use client";

import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/ui/button";
import { PromptDialog } from "@/components/ui/prompt-dialog";
import {
  useCompanyAction,
  useCompanyDetail,
  useSetCompanyTier,
} from "@/hooks/use-admin-companies";
import { countryLabel } from "@/lib/country";
import { safeFormat } from "@/lib/date";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { AuditTab } from "./tabs/audit-tab";
import { ComplaintsTab } from "./tabs/complaints-tab";
import { ConnectionsTab } from "./tabs/connections-tab";
import { DocsTab } from "./tabs/docs-tab";
import { ListingsTab } from "./tabs/listings-tab";
import { NotesTab } from "./tabs/notes-tab";
import { OrdersTab } from "./tabs/orders-tab";
import { MembershipTab } from "./tabs/membership-tab";
import { NotifyDialog } from "./notify-dialog";
import { SummaryTab } from "./tabs/summary-tab";
import { UsersTab } from "./tabs/users-tab";

const VERIFY_META: Record<
  string,
  { label: string; color: "green" | "amber" | "red" | "zinc" }
> = {
  VERIFIED: { label: "Doğrulandı", color: "green" },
  PENDING: { label: "Onay bekliyor", color: "amber" },
  REJECTED: { label: "Reddedildi", color: "red" },
  UNVERIFIED: { label: "Doğrulanmadı", color: "zinc" },
};

const TABS = [
  { key: "ozet", label: "Özet" },
  { key: "belgeler", label: "Belgeler" },
  { key: "uyelik", label: "Üyelik" },
  { key: "kullanicilar", label: "Kullanıcılar" },
  { key: "ilanlar", label: "İlanlar" },
  { key: "siparisler", label: "Siparişler" },
  { key: "baglantilar", label: "Bağlantılar" },
  { key: "sikayetler", label: "Şikayetler" },
  { key: "notlar", label: "Notlar" },
  { key: "denetim", label: "Denetim" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/**
 * Tam-sayfa firma detayı — eski modalın yerini alır. Sekmeler fazlarla dolar:
 * Kullanıcılar (Faz 4), İlanlar/Siparişler (Faz 5), Notlar (Faz 6).
 */
export function CompanyDetailView({
  companyId,
  initialTab,
}: {
  companyId: string;
  initialTab?: string;
}) {
  const { data, isLoading, isError, refetch } = useCompanyDetail(companyId);
  const [tab, setTab] = useState<TabKey>(
    TABS.some((t) => t.key === initialTab) ? (initialTab as TabKey) : "ozet",
  );
  const act = useCompanyAction();
  const tierAct = useSetCompanyTier();
  const [prompt, setPrompt] = useState<
    "tierMonths" | "suspendReason" | "notify" | null
  >(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="text-admin-text-muted h-6 w-6 animate-spin" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="space-y-4 py-16 text-center">
        <p className="text-admin-text-muted text-sm">Firma yüklenemedi.</p>
        <Button variant="secondary" onClick={() => void refetch()}>
          Tekrar dene
        </Button>
      </div>
    );
  }

  const meta = VERIFY_META[data.companyVerificationStatus] ?? VERIFY_META.UNVERIFIED;

  return (
    <div className="max-w-[1100px] space-y-6">
      {/* Üst şerit: geri + kimlik + hızlı işlemler */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            href="/admin/firmalar"
            className="text-admin-text-muted hover:text-admin-text mb-2 inline-flex items-center gap-1 text-xs font-medium"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Firmalar
          </Link>
          <h1 className="text-admin-text truncate text-2xl font-bold">
            {data.name}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge color={meta.color}>{meta.label}</Badge>
            <Badge color={data.tier === "PAKET" ? "amber" : "zinc"}>
              {data.tier === "PAKET" ? "Premium" : "Standart"}
            </Badge>
            {data.isBlocked ? <Badge color="red">Askıda</Badge> : null}
            <span className="text-admin-text-muted font-mono text-xs">
              {data.rothernId ?? "—"}
            </span>
            <span className="text-admin-text-muted text-xs">
              {countryLabel(data.country)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPrompt("notify")}
          >
            Bildirim Gönder
          </Button>
          {data.tier === "PAKET" ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={tierAct.isPending}
              onClick={() =>
                tierAct.mutate(
                  { id: companyId, tier: "STANDARD" },
                  {
                    onSuccess: () => toast.success("Standart'a alındı"),
                    onError: (e: unknown) =>
                      toast.error(e instanceof Error ? e.message : "Hata"),
                  },
                )
              }
            >
              PAKET Al
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              disabled={tierAct.isPending}
              onClick={() => setPrompt("tierMonths")}
            >
              PAKET Ver
            </Button>
          )}
          {data.isBlocked ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={act.isPending}
              onClick={() =>
                act.mutate(
                  { id: companyId, action: "unsuspend" },
                  {
                    onSuccess: () => toast.success("Askı kaldırıldı"),
                    onError: (e: unknown) =>
                      toast.error(e instanceof Error ? e.message : "Hata"),
                  },
                )
              }
            >
              Askıyı Kaldır
            </Button>
          ) : (
            <Button
              variant="danger"
              size="sm"
              disabled={act.isPending}
              onClick={() => setPrompt("suspendReason")}
            >
              Askıya Al
            </Button>
          )}
        </div>
      </div>

      {/* Askı bilgisi — görünür uyarı */}
      {data.isBlocked ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <strong>Askıda</strong>
          {data.blockedAt ? ` — ${safeFormat(data.blockedAt, "d MMM yyyy HH:mm")}` : ""}
          {data.blockedReason ? `: ${data.blockedReason}` : ""}
        </div>
      ) : null}

      {/* Sekmeler */}
      <div className="border-admin-border flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
              tab === t.key
                ? "border-admin-text text-admin-text"
                : "text-admin-text-muted hover:text-admin-text border-transparent"
            }`}
          >
            {t.label}
            {t.key === "sikayetler" && data.openComplaints > 0 ? (
              <Badge color="red">{data.openComplaints}</Badge>
            ) : null}
          </button>
        ))}
      </div>

      {/* Panel */}
      {tab === "ozet" ? <SummaryTab data={data} /> : null}
      {tab === "belgeler" ? <DocsTab companyId={companyId} data={data} /> : null}
      {tab === "uyelik" ? <MembershipTab companyId={companyId} data={data} /> : null}
      {tab === "kullanicilar" ? <UsersTab companyId={companyId} /> : null}
      {tab === "ilanlar" ? <ListingsTab companyId={companyId} /> : null}
      {tab === "siparisler" ? <OrdersTab companyId={companyId} /> : null}
      {tab === "baglantilar" ? (
        <ConnectionsTab companyId={companyId} />
      ) : null}
      {tab === "sikayetler" ? <ComplaintsTab companyId={companyId} /> : null}
      {tab === "notlar" ? <NotesTab companyId={companyId} /> : null}
      {tab === "denetim" ? <AuditTab companyId={companyId} /> : null}

      <PromptDialog
        open={prompt === "tierMonths"}
        title="Premium (PAKET) Ver"
        label="Kaç ay premium verilsin?"
        type="number"
        min={1}
        defaultValue="12"
        required
        confirmLabel="PAKET Ver"
        onConfirm={(v) => {
          const n = Math.floor(Number(v));
          tierAct.mutate(
            { id: companyId, tier: "PAKET", months: n >= 1 ? n : 12 },
            {
              onSuccess: () => toast.success("PAKET verildi"),
              onError: (e: unknown) =>
                toast.error(e instanceof Error ? e.message : "Hata"),
            },
          );
          setPrompt(null);
        }}
        onClose={() => setPrompt(null)}
      />
      {prompt === "notify" ? (
        <NotifyDialog companyId={companyId} onClose={() => setPrompt(null)} />
      ) : null}
      <PromptDialog
        open={prompt === "suspendReason"}
        title="Firmayı Askıya Al"
        label="Askı sebebi (opsiyonel)"
        placeholder="Örn. tekrarlanan şikayet"
        confirmLabel="Askıya Al"
        onConfirm={(v) => {
          act.mutate(
            { id: companyId, action: "suspend", reason: v || undefined },
            {
              onSuccess: () => toast.success("Askıya alındı"),
              onError: (e: unknown) =>
                toast.error(e instanceof Error ? e.message : "Hata"),
            },
          );
          setPrompt(null);
        }}
        onClose={() => setPrompt(null)}
      />
    </div>
  );
}
