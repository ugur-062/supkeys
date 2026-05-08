"use client";

import {
  useTenantUserMe,
  useUpdateNotificationPrefs,
} from "@/hooks/use-tenant-users";
import { extractErrorMessage } from "@/lib/tenders/error";
import { cn } from "@/lib/utils";
import { Bell, Lock as LockIcon, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  NOTIFICATION_GROUPS,
  type NotificationGroupDef,
  isPrefOn,
} from "./notification-config";
import { BackToSettings } from "./back-to-settings";

export function BildirimTercihleriView() {
  const meQuery = useTenantUserMe();
  const updateMutation = useUpdateNotificationPrefs();

  const initial = useMemo<Record<string, boolean>>(() => {
    const out: Record<string, boolean> = {};
    for (const group of NOTIFICATION_GROUPS) {
      for (const item of group.items) {
        out[item.key] = isPrefOn(
          meQuery.data?.notificationPrefs ?? null,
          item.key,
        );
      }
    }
    return out;
  }, [meQuery.data?.notificationPrefs]);

  const [prefs, setPrefs] = useState<Record<string, boolean>>(initial);

  // me yüklendiğinde state'i sync'le
  useEffect(() => {
    setPrefs(initial);
  }, [initial]);

  const persist = (next: Record<string, boolean>) => {
    setPrefs(next);
    updateMutation.mutate(next, {
      onError: (err) => {
        toast.error(extractErrorMessage(err, "Tercih güncellenemedi"));
        // Önceki state'e geri dön
        setPrefs(initial);
      },
    });
  };

  const togglePref = (key: string, locked: boolean) => {
    if (locked) return;
    persist({ ...prefs, [key]: !prefs[key] });
  };

  const toggleGroup = (group: NotificationGroupDef, allOn: boolean) => {
    if (group.locked) return;
    const next = { ...prefs };
    for (const it of group.items) {
      next[it.key] = !allOn;
    }
    persist(next);
  };

  if (meQuery.isLoading || !meQuery.data) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-12 flex items-center justify-center text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Yükleniyor…
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <BackToSettings />

      <div className="mt-4">
        <div className="flex items-center gap-3 mb-1">
          <div className="h-10 w-10 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0">
            <Bell className="h-5 w-5 text-brand-600" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-brand-900">
              Bildirim Tercihleri
            </h1>
            <p className="text-slate-500 text-sm mt-0.5">
              E-posta bildirimlerinizi kategoriler bazında yönetin.
              Değişiklikler otomatik kaydedilir.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {NOTIFICATION_GROUPS.map((group) => {
          const allOn = group.items.every((it) => prefs[it.key] !== false);
          const someOn = group.items.some((it) => prefs[it.key] !== false);
          const groupOn = group.locked ? true : allOn;

          return (
            <div
              key={group.key}
              className={cn(
                "bg-white border border-slate-200 rounded-2xl overflow-hidden",
                group.locked && "bg-slate-50/40",
              )}
            >
              <header className="p-4 flex items-center gap-3">
                <Toggle
                  checked={groupOn}
                  indeterminate={!group.locked && !allOn && someOn}
                  disabled={group.locked}
                  onChange={() => toggleGroup(group, allOn)}
                />
                <p className="font-bold text-brand-900 flex-1 text-sm">
                  {group.label}
                </p>
                {group.locked ? (
                  <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wide text-slate-500">
                    <LockIcon className="h-3 w-3" /> Kilitli
                  </span>
                ) : null}
              </header>

              <div className="border-t border-slate-100 px-4 py-3 space-y-1">
                {group.items.map((it) => {
                  const checked = group.locked
                    ? true
                    : prefs[it.key] !== false;
                  return (
                    <label
                      key={it.key}
                      className={cn(
                        "flex items-center gap-3 cursor-pointer rounded p-2 hover:bg-slate-50",
                        group.locked && "cursor-not-allowed opacity-70",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePref(it.key, !!group.locked)}
                        disabled={group.locked}
                        className="h-4 w-4 rounded text-brand-600 focus:ring-brand-500"
                      />
                      <span
                        className={cn(
                          "text-sm",
                          group.locked
                            ? "text-slate-500"
                            : "text-brand-900",
                        )}
                      >
                        {it.label}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Toggle({
  checked,
  indeterminate,
  disabled,
  onChange,
}: {
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
        "focus:outline-none focus:ring-2 focus:ring-brand-500/30",
        checked ? "bg-brand-600" : "bg-slate-200",
        indeterminate && "bg-brand-300",
        disabled && "opacity-50 cursor-not-allowed",
      )}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}
