"use client";

import { Checkbox } from "@/components/catalyst/checkbox";
import { Switch } from "@/components/catalyst/switch";
import {
  useSupplierNotificationPrefs,
  useUpdateSupplierNotificationPrefs,
} from "@/hooks/use-supplier-account";
import { extractErrorMessage } from "@/lib/tenders/error";
import { cn } from "@/lib/utils";
import { Bell, Check as CheckIcon, Loader2, Lock as LockIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  NOTIFICATION_GROUPS,
  type NotificationGroupDef,
  isPrefOn,
} from "./notification-config";

export function NotificationSection() {
  const prefsQuery = useSupplierNotificationPrefs();
  const updateMutation = useUpdateSupplierNotificationPrefs();

  const initial = useMemo<Record<string, boolean>>(() => {
    const out: Record<string, boolean> = {};
    for (const group of NOTIFICATION_GROUPS) {
      for (const item of group.items) {
        out[item.key] = isPrefOn(
          prefsQuery.data?.notificationPrefs ?? null,
          item.key,
        );
      }
    }
    return out;
  }, [prefsQuery.data?.notificationPrefs]);

  const [prefs, setPrefs] = useState<Record<string, boolean>>(initial);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    setPrefs(initial);
  }, [initial]);

  useEffect(() => {
    if (!savedAt) return;
    const t = setTimeout(() => setSavedAt(null), 2000);
    return () => clearTimeout(t);
  }, [savedAt]);

  const persist = (next: Record<string, boolean>) => {
    setPrefs(next);
    updateMutation.mutate(next, {
      onSuccess: () => setSavedAt(Date.now()),
      onError: (err) => {
        toast.error(extractErrorMessage(err, "Tercih güncellenemedi"));
        setPrefs(initial);
      },
    });
  };

  const setAll = (value: boolean) => {
    const next: Record<string, boolean> = { ...prefs };
    for (const group of NOTIFICATION_GROUPS) {
      if (group.locked) continue;
      for (const it of group.items) next[it.key] = value;
    }
    persist(next);
  };

  const togglePref = (key: string, locked: boolean) => {
    if (locked) return;
    persist({ ...prefs, [key]: !prefs[key] });
  };

  const toggleGroup = (group: NotificationGroupDef, allOn: boolean) => {
    if (group.locked) return;
    const next = { ...prefs };
    for (const it of group.items) next[it.key] = !allOn;
    persist(next);
  };

  return (
    <section className="card p-6">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-zinc-50">
          <Bell className="h-5 w-5 text-zinc-600" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-lg text-zinc-900">
              Bildirim Tercihleri
            </h2>
            {savedAt ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-success-50 px-2 py-0.5 text-xs font-semibold text-success-700">
                <CheckIcon className="h-3 w-3" />
                Kaydedildi
              </span>
            ) : null}
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            Değişiklikler otomatik kaydedilir. Sistem bildirimleri kapatılamaz.
          </p>
        </div>
      </div>

      {prefsQuery.isLoading ? (
        <div className="flex items-center justify-center py-8 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Yükleniyor…
        </div>
      ) : (
        <>
          <div className="mb-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setAll(true)}
              className="rounded-lg ring-1 ring-zinc-950/5 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-success-300 hover:text-success-700"
            >
              Hepsini Aç
            </button>
            <button
              type="button"
              onClick={() => setAll(false)}
              className="rounded-lg ring-1 ring-zinc-950/5 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-danger-300 hover:text-danger-700"
            >
              Hepsini Kapat
            </button>
          </div>

          <div className="space-y-4">
            {NOTIFICATION_GROUPS.map((group) => {
              const allOn = group.items.every((it) => prefs[it.key] !== false);
              const someOn = group.items.some((it) => prefs[it.key] !== false);
              const groupOn = group.locked ? true : allOn;

              return (
                <div
                  key={group.key}
                  className={cn(
                    "border border-slate-200 rounded-2xl overflow-hidden",
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
                    <p className="font-bold text-zinc-900 flex-1 text-sm">
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
                        <div
                          key={it.key}
                          className={cn(
                            "flex items-center gap-3 rounded p-2",
                            group.locked && "opacity-70",
                          )}
                        >
                          <Checkbox
                            checked={checked}
                            onChange={() => togglePref(it.key, !!group.locked)}
                            disabled={group.locked}
                          />
                          <span
                            className={cn(
                              "text-sm",
                              group.locked ? "text-zinc-500" : "text-zinc-900",
                            )}
                          >
                            {it.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

function Toggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  return (
    <Switch checked={checked} disabled={disabled} onChange={() => onChange()} />
  );
}
