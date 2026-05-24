"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAddTenderInvitations } from "@/hooks/use-tenant-tenders";
import { useSuppliers } from "@/hooks/use-tenant-suppliers";
import { extractErrorMessage } from "@/lib/tenders/error";
import { cn } from "@/lib/utils";
import * as Dialog from "@radix-ui/react-dialog";
import { Building2, Search, UserPlus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

interface Props {
  tenderId: string;
  /** Davet edilebilirlik durumu — header_card hesaplar */
  enabled: boolean;
  /** Zaten davetli supplier ID'leri — listede gizli yapılır */
  alreadyInvitedSupplierIds: string[];
}

/**
 * V2-7+ — Mevcut ihaleye sonradan tedarikçi ekleme butonu.
 * Modal'da aktif relation'lardan zaten davetli olmayanlar listelenir.
 * Multi-select, POST /invitations.
 */
export function InviteSupplierButton({
  tenderId,
  enabled,
  alreadyInvitedSupplierIds,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const suppliersQuery = useSuppliers({
    status: "ACTIVE",
    pageSize: 100,
  });
  const addMutation = useAddTenderInvitations(tenderId);

  const candidates = useMemo(() => {
    const items = suppliersQuery.data?.items ?? [];
    const invitedSet = new Set(alreadyInvitedSupplierIds);
    const q = search.trim().toLowerCase();
    return items
      .filter((s) => !invitedSet.has(s.supplier.id))
      .filter((s) =>
        q ? s.supplier.companyName.toLowerCase().includes(q) : true,
      );
  }, [suppliersQuery.data, alreadyInvitedSupplierIds, search]);

  const handleClose = () => {
    if (addMutation.isPending) return;
    setOpen(false);
    setSelectedIds([]);
    setSearch("");
  };

  const handleSubmit = async () => {
    if (selectedIds.length === 0) return;
    try {
      const result = await addMutation.mutateAsync(selectedIds);
      const msg =
        result.added > 0
          ? `${result.added} tedarikçi davet edildi${
              result.skipped > 0 ? ` (${result.skipped} zaten davetliydi)` : ""
            }`
          : "Seçilen tedarikçiler zaten davetli";
      toast.success(msg);
      handleClose();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Davet gönderilemedi"));
    }
  };

  if (!enabled) return null;

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        title="Bu ihaleye yeni tedarikçi davet et"
      >
        <UserPlus className="w-4 h-4" />
        Tedarikçi Davet Et
      </Button>

      <Dialog.Root open={open} onOpenChange={(o) => !o && handleClose()}>
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
                <div className="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center shrink-0">
                  <UserPlus className="w-5 h-5 text-brand-600" />
                </div>
                <div className="min-w-0">
                  <Dialog.Title className="font-display font-bold text-lg text-brand-900">
                    Tedarikçi Davet Et
                  </Dialog.Title>
                  <Dialog.Description className="text-sm text-slate-500">
                    Aktif tedarikçilerinizden seçin
                  </Dialog.Description>
                </div>
              </div>
              <Dialog.Close asChild>
                <button
                  aria-label="Kapat"
                  className="p-1.5 rounded-lg hover:bg-surface-muted text-slate-400 hover:text-slate-600 transition-colors shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </Dialog.Close>
            </header>

            <div className="px-5 py-3 border-b border-surface-border">
              <Field>
                <Label htmlFor="supplier-search" className="sr-only">
                  Tedarikçi ara
                </Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <Input
                    id="supplier-search"
                    type="search"
                    placeholder="Tedarikçi adı ara…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </Field>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-2">
              {suppliersQuery.isLoading ? (
                <p className="text-sm text-slate-500 text-center py-8">
                  Yükleniyor…
                </p>
              ) : candidates.length === 0 ? (
                <div className="text-center py-8 px-4 space-y-2">
                  <p className="text-sm font-medium text-slate-600">
                    {alreadyInvitedSupplierIds.length > 0
                      ? "Davet edilebilecek başka tedarikçi yok"
                      : "Aktif tedarikçiniz yok"}
                  </p>
                  <p className="text-xs text-slate-400">
                    Tedarikçiler sayfasından davet gönderip ilişki kurabilirsiniz.
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  {candidates.map((s) => {
                    const id = s.supplier.id;
                    const checked = selectedIds.includes(id);
                    return (
                      <label
                        key={id}
                        className={cn(
                          "flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors",
                          checked
                            ? "bg-brand-50 border border-brand-200"
                            : "border border-transparent hover:bg-slate-50",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setSelectedIds((prev) =>
                              e.target.checked
                                ? [...prev, id]
                                : prev.filter((x) => x !== id),
                            );
                          }}
                          className="w-4 h-4 shrink-0"
                        />
                        <div className="h-8 w-8 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
                          <Building2 className="h-4 w-4 text-brand-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-brand-900 truncate">
                            {s.supplier.companyName}
                          </p>
                          {s.supplier.city ? (
                            <p className="text-[11px] text-slate-500 truncate">
                              {s.supplier.city}
                              {s.supplier.district
                                ? ` · ${s.supplier.district}`
                                : ""}
                            </p>
                          ) : null}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <footer className="px-5 py-4 border-t border-surface-border flex items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                {selectedIds.length > 0
                  ? `${selectedIds.length} tedarikçi seçildi`
                  : "Tedarikçi seçin"}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleClose}
                  disabled={addMutation.isPending}
                >
                  Vazgeç
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSubmit}
                  disabled={selectedIds.length === 0 || addMutation.isPending}
                  loading={addMutation.isPending}
                >
                  Davet Gönder
                </Button>
              </div>
            </footer>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
