"use client";

import { Button } from "@/components/catalyst/button";
import { Checkbox } from "@/components/catalyst/checkbox";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Input, InputGroup } from "@/components/catalyst/input";
import { roleLabel } from "@/lib/users/labels";
import type { TenantUserListItem } from "@/lib/users/types";
import { cn } from "@/lib/utils";
import { MagnifyingGlassIcon } from "@heroicons/react/16/solid";
import { Flag } from "lucide-react";
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
    <Dialog open={open} onClose={onClose} size="lg">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100">
          <Flag className="h-5 w-5 text-zinc-700 fill-current" />
        </div>
        <div>
          <DialogTitle>Kazandırmayı Yapan Kişileri Seç</DialogTitle>
          <DialogDescription>
            Bu akışı hangi kullanıcılar tetikleyebilir? (En az 1 kişi)
          </DialogDescription>
        </div>
      </div>

      <DialogBody className="space-y-3">
        <div>
          <InputGroup>
            <MagnifyingGlassIcon data-slot="icon" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Kullanıcı ara…"
              autoFocus
            />
          </InputGroup>
          <p className="text-[11px] text-zinc-500 mt-2">
            Sadece <strong>Yönetici</strong> ve <strong>Satın Almacı</strong>{" "}
            roller listede.
          </p>
        </div>

        {filtered.length === 0 ? (
          <p className="text-sm text-zinc-500 text-center py-8">
            {users.length === 0
              ? "Bu rolde aktif kullanıcı yok"
              : "Eşleşen kullanıcı yok"}
          </p>
        ) : (
          <ul className="space-y-1 max-h-80 overflow-y-auto">
            {filtered.map((u) => {
              const checked = selected.has(u.id);
              return (
                <li key={u.id}>
                  <div
                    className={cn(
                      "flex items-center gap-3 p-2.5 rounded-lg transition ring-1",
                      checked
                        ? "bg-zinc-50 ring-zinc-950/15"
                        : "ring-transparent hover:bg-zinc-50",
                    )}
                  >
                    <Checkbox checked={checked} onChange={() => toggle(u.id)} />
                    <div className="h-9 w-9 rounded-full bg-zinc-200 flex items-center justify-center text-xs font-bold text-zinc-700 flex-shrink-0">
                      {(u.firstName?.[0] ?? "?").toUpperCase()}
                      {(u.lastName?.[0] ?? "").toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-zinc-900 truncate">
                        {u.firstName} {u.lastName}
                      </p>
                      <p className="text-xs text-zinc-500 truncate">
                        {u.email} · {roleLabel(u.role)}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </DialogBody>

      <DialogActions>
        <Button plain onClick={onClose}>
          Vazgeç
        </Button>
        <Button
          onClick={() => onSave(Array.from(selected))}
          disabled={selected.size === 0}
        >
          Kaydet ({selected.size})
        </Button>
      </DialogActions>
    </Dialog>
  );
}
