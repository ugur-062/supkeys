"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { roleLabel } from "@/lib/users/labels";
import type { TenantUserListItem } from "@/lib/users/types";
import { cn } from "@/lib/utils";
import * as Dialog from "@radix-ui/react-dialog";
import { Flag, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  users: TenantUserListItem[];
  selectedIds: string[];
  onSave: (ids: string[]) => void;
}

export function InitiatorPickerModal({
  open,
  onClose,
  users,
  selectedIds,
  onSave,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(selectedIds),
  );
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (open) {
      setSelected(new Set(selectedIds));
      setSearch("");
    }
  }, [open, selectedIds]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return users;
    return users.filter((u) =>
      `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(term),
    );
  }, [users, search]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-900/60 z-[60]" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[60]",
            "w-[calc(100vw-2rem)] max-w-lg bg-white rounded-2xl shadow-2xl outline-none",
            "max-h-[85vh] flex flex-col",
          )}
        >
          <header className="px-5 py-4 border-b border-surface-border flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                <Flag className="w-5 h-5 text-blue-600 fill-current" />
              </div>
              <div>
                <Dialog.Title className="font-display font-bold text-lg text-brand-900">
                  Süreç Başlatıcılarını Seç
                </Dialog.Title>
                <Dialog.Description className="text-sm text-slate-500 mt-0.5">
                  Bu akışı hangi kullanıcılar tetikleyebilir? (En az 1 kişi)
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Kapat"
                className="p-1.5 rounded-lg hover:bg-surface-muted text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </header>

          <div className="px-5 py-4 border-b border-surface-border">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Kullanıcı ara…"
                className="pl-9"
                autoFocus
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              Sadece <strong>Yönetici</strong> ve{" "}
              <strong>Satın Almacı</strong> roller listede.
            </p>
          </div>

          <div className="overflow-y-auto flex-1 px-5 py-3">
            {filtered.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-8">
                {users.length === 0
                  ? "Bu rolde aktif kullanıcı yok"
                  : "Eşleşen kullanıcı yok"}
              </p>
            ) : (
              <ul className="space-y-1">
                {filtered.map((u) => {
                  const checked = selected.has(u.id);
                  return (
                    <li key={u.id}>
                      <label
                        className={cn(
                          "flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition",
                          checked
                            ? "bg-brand-50/40 border border-brand-200"
                            : "hover:bg-slate-50 border border-transparent",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(u.id)}
                          className="h-4 w-4 rounded text-brand-600"
                        />
                        <div className="h-9 w-9 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-brand-700 flex-shrink-0">
                          {(u.firstName?.[0] ?? "?").toUpperCase()}
                          {(u.lastName?.[0] ?? "").toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-brand-900 truncate">
                            {u.firstName} {u.lastName}
                          </p>
                          <p className="text-xs text-slate-500 truncate">
                            {u.email} · {roleLabel(u.role)}
                          </p>
                        </div>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <footer className="px-5 py-4 border-t border-surface-border flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              className="flex-1"
            >
              Vazgeç
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => onSave(Array.from(selected))}
              disabled={selected.size === 0}
              className="flex-1"
            >
              Kaydet ({selected.size})
            </Button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
