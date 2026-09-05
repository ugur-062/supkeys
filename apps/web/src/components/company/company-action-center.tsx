"use client";

import { ErrorState } from "@/components/ui/error-state";
import { useActionCenter, type ActionCenterApiRow, type ActionSeverity } from "@/hooks/use-company-dashboard";
import { useUnreadMessages } from "@/hooks/use-company-messages";
import type { PortalKey } from "@/lib/company/portals";
import { ACTION_ROWS } from "@/lib/dashboard/strings";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, ChevronRight, Clock3, Info, type LucideIcon } from "lucide-react";
import Link from "next/link";

/**
 * BEKLEYEN İŞLER — Şirketim › Genel Bakış (2026-09-05). Eski Aksiyon
 * Merkezi'nin TAM listesi, iki portal birleşik; satır başında portal rozeti,
 * gruplar ACİLİYETE göre: Gecikmiş · Bugün · Bu hafta · Bekleyen. Veri ve
 * öncelik sunucuda (`action-center?portal=`), metin haritası `ACTION_ROWS`.
 * Hiç iş yoksa tek satır; hata dalı KORUNUR (boş liste sanılmasın).
 */
const DAY_MS = 86_400_000;
type Group = "overdue" | "today" | "week" | "waiting";
const GROUP_LABEL: Record<Group, string> = { overdue: "Gecikmiş", today: "Bugün", week: "Bu hafta", waiting: "Bekleyen" };
const GROUP_ORDER: Group[] = ["overdue", "today", "week", "waiting"];
const SEVERITY_RANK: Record<ActionSeverity, number> = { critical: 0, warning: 1, info: 2 };
const SEVERITY_META: Record<ActionSeverity, { icon: LucideIcon; cls: string; label: string }> = {
  critical: { icon: AlertTriangle, cls: "bg-rose-50 text-rose-600", label: "kritik" },
  warning: { icon: Clock3, cls: "bg-amber-50 text-amber-600", label: "uyarı" },
  info: { icon: Info, cls: "bg-zinc-100 text-zinc-500", label: "bilgi" },
};

export interface CompanyActionItem extends ActionCenterApiRow {
  portal: PortalKey;
  text: string;
  href: string;
}

function daysUntil(dueAt: string): number {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return Math.floor((new Date(dueAt).getTime() - start.getTime()) / DAY_MS);
}

export function groupOf(r: ActionCenterApiRow): Group {
  if (r.overdueDays != null) return "overdue";
  if (r.dueAt) {
    const d = daysUntil(r.dueAt);
    if (d <= 0) return "today";
    if (d <= 7) return "week";
  }
  return "waiting";
}

function timeLabel(r: ActionCenterApiRow): string | null {
  if (r.overdueDays != null) return r.overdueDays === 0 ? "bugün gecikti" : `${r.overdueDays} gün gecikti`;
  if (r.dueAt) {
    const d = daysUntil(r.dueAt);
    if (d <= 0) return "bugün";
    if (d === 1) return "yarın";
    return `${d} gün kaldı`;
  }
  if (r.waitingDays != null && r.waitingDays > 0) return `${r.waitingDays} gündür bekliyor`;
  return null;
}

/** Ham satırlar (+ okunmamış mesaj) → etiketli, gruplu, sıralı liste. */
export function buildCompanyActions(
  input: { portal: PortalKey; rows: ActionCenterApiRow[]; unread: number }[],
): Record<Group, CompanyActionItem[]> {
  const out: Record<Group, CompanyActionItem[]> = { overdue: [], today: [], week: [], waiting: [] };
  for (const { portal, rows, unread } of input) {
    const texts = ACTION_ROWS[portal];
    const all: ActionCenterApiRow[] = [...rows];
    if (unread > 0) all.push({ key: "messages", severity: "info", count: unread, dueAt: null, overdueDays: null, waitingDays: null });
    for (const r of all) {
      const t = texts[r.key];
      if (!t) continue;
      out[groupOf(r)].push({ ...r, portal, text: t.text, href: t.href });
    }
  }
  for (const g of GROUP_ORDER) {
    out[g].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.count - a.count);
  }
  return out;
}

export function CompanyActionCenter({ portals }: { portals: PortalKey[] }) {
  const hasSa = portals.includes("satinalma");
  const hasSt = portals.includes("satis");
  const sa = useActionCenter("satinalma", hasSa);
  const st = useActionCenter("satis", hasSt);
  const saUnread = useUnreadMessages("satinalma", hasSa);
  const stUnread = useUnreadMessages("satis", hasSt);
  const loading = (hasSa && sa.isLoading) || (hasSt && st.isLoading);
  const error = (hasSa && sa.isError) || (hasSt && st.isError);

  if (loading) return <div className="h-40 animate-pulse rounded-2xl bg-zinc-100" aria-hidden />;
  if (error) {
    return (
      <ErrorState
        title="Bekleyen işler yüklenemedi"
        message="Liste alınamadı — bu, bekleyen işiniz olmadığı anlamına GELMEZ."
        onRetry={() => {
          if (hasSa) void sa.refetch();
          if (hasSt) void st.refetch();
        }}
      />
    );
  }
  const groups = buildCompanyActions([
    ...(hasSa ? [{ portal: "satinalma" as const, rows: sa.data?.rows ?? [], unread: saUnread.data?.count ?? 0 }] : []),
    ...(hasSt ? [{ portal: "satis" as const, rows: st.data?.rows ?? [], unread: stUnread.data?.count ?? 0 }] : []),
  ]);
  const total = GROUP_ORDER.reduce((n, g) => n + groups[g].length, 0);

  return (
    <section aria-labelledby="bekleyen-isler" className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-950/5">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-950/5 px-5 py-3.5">
        <h2 id="bekleyen-isler" className="text-base font-semibold tracking-tight text-zinc-950">
          Bekleyen işler
        </h2>
        {total > 0 ? (
          <span className="rounded-full bg-zinc-950 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-white">{total}</span>
        ) : null}
      </div>
      {total === 0 ? (
        <p className="flex items-center gap-2 px-5 py-4 text-sm text-zinc-600">
          <CheckCircle2 className="size-4 text-emerald-500" aria-hidden />
          Bekleyen iş yok.
        </p>
      ) : (
        GROUP_ORDER.filter((g) => groups[g].length > 0).map((g) => (
          <div key={g}>
            <p className="bg-zinc-50 px-5 py-1.5 text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">
              {GROUP_LABEL[g]} <span className="normal-case tabular-nums text-zinc-400">· {groups[g].length}</span>
            </p>
            <ul className="divide-y divide-zinc-950/5">
              {groups[g].map((r) => {
                const meta = SEVERITY_META[r.severity];
                const time = timeLabel(r);
                return (
                  <li key={`${r.portal}:${r.key}`}>
                    <Link
                      href={r.href}
                      aria-label={`${r.count} ${r.text}${time ? ` — ${time}` : ""}`}
                      className="group flex items-center gap-3 px-5 py-3 transition hover:bg-zinc-50 focus-visible:bg-zinc-50 focus-visible:outline-none"
                    >
                      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", meta.cls)} title={meta.label}>
                        <meta.icon className="size-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1 text-sm text-zinc-700">
                        <strong className="font-semibold tabular-nums text-zinc-950">{r.count}</strong>{" "}
                        <span className="group-hover:text-zinc-950">{r.text}</span>
                        {time ? (
                          <span
                            className={cn(
                              "ml-2 whitespace-nowrap text-xs font-medium",
                              r.severity === "critical" ? "text-rose-600" : r.severity === "warning" ? "text-amber-600" : "text-zinc-400",
                            )}
                          >
                            {`— ${time}`}
                          </span>
                        ) : null}
                      </span>
                      <span
                        className={cn(
                          "hidden shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold sm:inline",
                          r.portal === "satinalma" ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700",
                        )}
                      >
                        {r.portal === "satinalma" ? "Satınalma" : "Satış"}
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-zinc-300 transition-all group-hover:translate-x-0.5 group-hover:text-zinc-600" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
