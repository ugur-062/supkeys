"use client";

import {
  useActionCenter,
  type ActionCenterApiRow,
  type ActionSeverity,
} from "@/hooks/use-company-dashboard";
import { useUnreadMessages } from "@/hooks/use-company-messages";
import { ACTION_ROWS, DASH } from "@/lib/dashboard/strings";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Info,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

/**
 * Aksiyon Merkezi (Faz 2) — "bugün ne yapmalıyım" TEK uyarı sistemi. Veri +
 * sıralama backend'de (`/company/dashboard/action-center`); burada yalnız
 * metin haritası + zaman etiketi + maks 5 satır ve "Tümünü gör". Okunmamış
 * mesaj satırı tek istisna (ayrı canlı sayaç ucundan gelir, info olarak
 * listeye eklenir). Hiç satır yoksa nötr boş durum — sahte satır üretilmez.
 */

const MAX_VISIBLE = 5;

const SEVERITY_META: Record<
  ActionSeverity,
  { icon: LucideIcon; cls: string; label: string }
> = {
  critical: {
    icon: AlertTriangle,
    cls: "bg-rose-50 text-rose-600",
    label: "kritik",
  },
  warning: { icon: Clock3, cls: "bg-amber-50 text-amber-600", label: "uyarı" },
  info: { icon: Info, cls: "bg-slate-100 text-slate-500", label: "bilgi" },
};

const DAY_MS = 86_400_000;

/** Takvim günü bazlı zaman etiketi — "bugün / yarın / N gün kaldı" vb. */
function timeLabel(r: ActionCenterApiRow): string | null {
  if (r.overdueDays != null) {
    return r.overdueDays === 0 ? "bugün gecikti" : `${r.overdueDays} gün gecikti`;
  }
  if (r.dueAt) {
    const due = new Date(r.dueAt);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const days = Math.floor((due.getTime() - startOfToday.getTime()) / DAY_MS);
    if (days <= 0) return "bugün";
    if (days === 1) return "yarın";
    return `${days} gün kaldı`;
  }
  if (r.waitingDays != null && r.waitingDays > 0) {
    return `${r.waitingDays} gündür bekliyor`;
  }
  return null;
}

export function ActionCenter({ portal }: { portal: "satinalma" | "satis" }) {
  const query = useActionCenter(portal);
  const unread = useUnreadMessages(portal);
  const [expanded, setExpanded] = useState(false);

  if (query.isLoading) {
    return (
      <div className="h-32 animate-pulse rounded-xl bg-zinc-200/60" aria-hidden />
    );
  }

  const texts = ACTION_ROWS[portal];
  const rows: ActionCenterApiRow[] = [...(query.data?.rows ?? [])];
  const unreadCount = unread.data?.count ?? 0;
  if (unreadCount > 0) {
    rows.push({
      key: "messages",
      severity: "info",
      count: unreadCount,
      dueAt: null,
      overdueDays: null,
      waitingDays: null,
    });
  }
  // Backend sıralı gönderir; messages sona eklendi (info) — severity kırılımı
  // bozulmasın diye yeniden sıralamaya gerek yok (info zaten en sonda).
  const known = rows.filter((r) => texts[r.key]);
  const visible = expanded ? known : known.slice(0, MAX_VISIBLE);
  const hiddenCount = known.length - MAX_VISIBLE;

  return (
    <section
      className="rounded-xl border border-slate-200 bg-white p-0 shadow-sm"
      aria-label="Aksiyon merkezi"
    >
      <h2 className="border-b border-slate-100 px-5 py-3 text-sm font-medium text-slate-500">
        {DASH.actionTitle}
      </h2>
      {known.length === 0 ? (
        <p className="flex items-center gap-2 px-5 py-4 text-sm text-slate-500">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden />
          {DASH.actionEmpty}
        </p>
      ) : (
        <>
          <ul className="divide-y divide-slate-100">
            {/* Satırın TAMAMI tıklanabilir (sağdaki ayrı CTA tuşu kaldırıldı,
                kullanıcı isteği 2026-08-03) — sistemdeki liste dili: hover
                zemin + sağa kayan ok. */}
            {visible.map((r) => {
              const meta = SEVERITY_META[r.severity];
              const t = texts[r.key]!;
              const time = timeLabel(r);
              return (
                <li key={r.key}>
                  <Link
                    href={t.href}
                    aria-label={`${r.count} ${t.text}${time ? ` — ${time}` : ""}`}
                    className="group flex items-center gap-3 px-5 py-3 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:bg-slate-50"
                  >
                    <span
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-105",
                        meta.cls,
                      )}
                      title={meta.label}
                    >
                      <meta.icon className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1 text-sm text-slate-700">
                      <strong className="font-semibold tabular-nums text-slate-950">
                        {r.count}
                      </strong>{" "}
                      <span className="group-hover:text-slate-950">{t.text}</span>
                      {time ? (
                        <span
                          className={cn(
                            "ml-2 whitespace-nowrap text-xs font-medium",
                            r.severity === "critical"
                              ? "text-rose-600"
                              : r.severity === "warning"
                                ? "text-amber-600"
                                : "text-slate-400",
                          )}
                        >
                          {`— ${time}`}
                        </span>
                      ) : null}
                    </span>
                    <ChevronRight
                      className="h-4 w-4 shrink-0 text-slate-300 transition-all group-hover:translate-x-0.5 group-hover:text-slate-600"
                      aria-hidden
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
          {hiddenCount > 0 || expanded ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="w-full border-t border-slate-100 px-5 py-2.5 text-left text-xs font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
            >
              {expanded ? DASH.actionShowLess : DASH.actionShowAll(known.length)}
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
