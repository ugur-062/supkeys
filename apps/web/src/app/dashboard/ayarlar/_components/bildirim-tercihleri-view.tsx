"use client";

import { Checkbox } from "@/components/catalyst/checkbox";
import { Input, InputGroup } from "@/components/catalyst/input";
import { Switch } from "@/components/catalyst/switch";
import {
  useTenantUserMe,
  useUpdateNotificationPrefs,
} from "@/hooks/use-tenant-users";
import { extractErrorMessage } from "@/lib/tenders/error";
import { cn } from "@/lib/utils";
import { MagnifyingGlassIcon } from "@heroicons/react/16/solid";
import { Bell, Check as CheckIcon, Loader2, Lock as LockIcon } from "lucide-react";
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
  const [search, setSearch] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // me yüklendiğinde state'i sync'le
  useEffect(() => {
    setPrefs(initial);
  }, [initial]);

  // "Kaydedildi" rozeti 2sn sonra kaybolur
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
      for (const it of group.items) {
        next[it.key] = value;
      }
    }
    persist(next);
  };

  // Search filtering (group label OR item label)
  const filteredGroups = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr-TR");
    if (!q) return NOTIFICATION_GROUPS;
    return NOTIFICATION_GROUPS.map((group) => {
      const groupHit = group.label.toLocaleLowerCase("tr-TR").includes(q);
      const items = groupHit
        ? group.items
        : group.items.filter((it) =>
            it.label.toLocaleLowerCase("tr-TR").includes(q),
          );
      return items.length > 0 ? { ...group, items } : null;
    }).filter((g): g is typeof NOTIFICATION_GROUPS[number] => g !== null);
  }, [search]);

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
      <div className="max-w-3xl mx-auto px-6 py-12 flex items-center justify-center text-zinc-500">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Yükleniyor…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <BackToSettings />

      <div className="mt-4">
        <div className="mb-1 flex items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-zinc-100">
            <Bell className="h-5 w-5 text-zinc-600" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold text-zinc-900">
                Bildirim Tercihleri
              </h1>
              {savedAt ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-success-50 px-2 py-0.5 text-xs font-semibold text-success-700">
                  <CheckIcon className="h-3 w-3" />
                  Kaydedildi
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-sm text-slate-500">
              Değişiklikler otomatik kaydedilir. Sistem bildirimleri kapatılamaz.
            </p>
          </div>
        </div>
      </div>

      {/* Toolbar: search + bulk actions */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px]">
          <InputGroup>
            <MagnifyingGlassIcon data-slot="icon" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Bildirim ara…"
            />
          </InputGroup>
        </div>
        <button
          type="button"
          onClick={() => setAll(true)}
          className="rounded-lg border border-zinc-950/10 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:border-success-300 hover:text-success-700"
        >
          Hepsini Aç
        </button>
        <button
          type="button"
          onClick={() => setAll(false)}
          className="rounded-lg border border-zinc-950/10 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:border-danger-300 hover:text-danger-700"
        >
          Hepsini Kapat
        </button>
      </div>

      <div className="mt-4 space-y-4">
        {filteredGroups.length === 0 ? (
          <p className="rounded-2xl bg-white p-8 text-center text-sm text-zinc-500 ring-1 ring-zinc-950/5">
            "{search}" için sonuç bulunamadı.
          </p>
        ) : null}
        {filteredGroups.map((group) => {
          const allOn = group.items.every((it) => prefs[it.key] !== false);
          const groupOn = group.locked ? true : allOn;

          return (
            <div
              key={group.key}
              className={cn(
                "bg-white rounded-2xl overflow-hidden ring-1 ring-zinc-950/5",
                group.locked && "bg-zinc-50/40",
              )}
            >
              <header className="p-4 flex items-center gap-3">
                <Switch
                  checked={groupOn}
                  disabled={group.locked}
                  onChange={() => toggleGroup(group, allOn)}
                />
                <p className="font-bold text-zinc-900 flex-1 text-sm">
                  {group.label}
                </p>
                {group.locked ? (
                  <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wide text-zinc-500">
                    <LockIcon className="h-3 w-3" /> Kilitli
                  </span>
                ) : null}
              </header>

              <div className="border-t border-zinc-950/5 px-4 py-3 space-y-1">
                {group.items.map((it) => {
                  const checked = group.locked
                    ? true
                    : prefs[it.key] !== false;
                  return (
                    <div
                      key={it.key}
                      className={cn(
                        "flex items-center gap-3 rounded p-2 hover:bg-zinc-50",
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
    </div>
  );
}

