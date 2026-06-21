"use client";

import { Checkbox } from "@/components/catalyst/checkbox";
import { InvitationStatusBadge } from "@/components/tenders/status-badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useAddTenderInvitations,
  useInviteByEmail,
} from "@/hooks/use-tenant-tenders";
import { useSuppliers } from "@/hooks/use-tenant-suppliers";
import { extractErrorMessage } from "@/lib/tenders/error";
import type { TenderInvitationDetail } from "@/lib/tenders/types";
import { cn } from "@/lib/utils";
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from "@headlessui/react";
import { Building2, Info, Mail, Search, UserPlus, Users, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

interface Props {
  tenderId: string;
  /** Davet edilebilirlik durumu — header_card hesaplar */
  enabled: boolean;
  /** Mevcut davetler — modal'da listelenir; ID'ler "yeni davet" kısmında filter için kullanılır */
  invitations: TenderInvitationDetail[];
}

/**
 * V2-7+ — Tedarikçi İşlemleri modal'ı: mevcut davetlileri gösterir
 * ve yeni davet eklenebilir. Multi-select, POST /invitations.
 */
export function InviteSupplierButton({
  tenderId,
  enabled,
  invitations,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteContactName, setInviteContactName] = useState("");

  const suppliersQuery = useSuppliers({
    status: "ACTIVE",
    pageSize: 100,
  });
  const addMutation = useAddTenderInvitations(tenderId);
  const emailMutation = useInviteByEmail(tenderId);

  const alreadyInvitedSupplierIds = useMemo(
    () => invitations.map((i) => i.supplier.id),
    [invitations],
  );

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
    if (addMutation.isPending || emailMutation.isPending) return;
    setOpen(false);
    setSelectedIds([]);
    setSearch("");
    setInviteEmail("");
    setInviteContactName("");
  };

  const handleEmailInvite = async () => {
    const email = inviteEmail.trim();
    if (!email) return;
    try {
      const res = await emailMutation.mutateAsync({
        email,
        contactName: inviteContactName.trim() || undefined,
      });
      toast.success(res.message ?? "Davet gönderildi");
      setInviteEmail("");
      setInviteContactName("");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Davet gönderilemedi"));
    }
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
        title="Davetli tedarikçileri görüntüle veya yeni davet ekle"
      >
        <Users className="w-4 h-4" />
        Tedarikçi İşlemleri
      </Button>

      <Dialog open={open} onClose={handleClose} className="relative z-[60]">
        <DialogBackdrop
          transition
          className="fixed inset-0 bg-zinc-950/40 transition data-closed:opacity-0 data-enter:duration-200 data-leave:duration-150"
        />
        <div className="fixed inset-0 flex w-screen items-center justify-center p-2 sm:p-4">
          <DialogPanel
            transition
            className="flex h-[90vh] max-h-[calc(100vh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-zinc-950/10 outline-none transition data-closed:opacity-0 data-enter:duration-200 data-leave:duration-150 data-closed:data-enter:scale-95"
          >
            <header className="px-5 py-4 border-b border-zinc-950/5 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5 text-zinc-700" />
                </div>
                <div className="min-w-0">
                  <DialogTitle className="font-semibold text-lg text-zinc-950">
                    Tedarikçi İşlemleri
                  </DialogTitle>
                  <p className="text-sm text-zinc-500">
                    {invitations.length > 0
                      ? `${invitations.length} davetli tedarikçi · yeni davet ekleyebilirsiniz`
                      : "Henüz davetli yok · aşağıdan ekleyebilirsiniz"}
                  </p>
                </div>
              </div>
              <IconButton aria-label="Kapat" onClick={handleClose}>
                <X className="w-4 h-4" />
              </IconButton>
            </header>

            <div className="flex-1 overflow-y-auto">
              {/* SECTION 1 — Mevcut Davetliler */}
              <section className="px-5 py-4 border-b border-surface-border">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                  Davet Edilen Tedarikçiler{" "}
                  <span className="text-slate-400 normal-case font-normal">
                    ({invitations.length})
                  </span>
                </h3>
                {invitations.length === 0 ? (
                  <p className="text-sm text-slate-500 py-3">
                    Bu ihaleye henüz tedarikçi davet edilmedi.
                  </p>
                ) : (
                  <ul className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                    {invitations.map((inv) => (
                      <li
                        key={inv.id}
                        className="flex items-center gap-3 p-2.5 rounded-lg border border-surface-border bg-slate-50/40"
                      >
                        <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                          <Building2 className="h-4 w-4 text-slate-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-brand-900 truncate">
                            {inv.supplier.companyName}
                          </p>
                          {inv.supplier.city ? (
                            <p className="text-[11px] text-slate-500 truncate">
                              {inv.supplier.city}
                              {inv.supplier.district
                                ? ` · ${inv.supplier.district}`
                                : ""}
                            </p>
                          ) : null}
                        </div>
                        <InvitationStatusBadge status={inv.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* SECTION 2 — Listeden Davet Et (aktif tedarikçiler) */}
              <section className="px-5 py-4 border-t border-surface-border">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Listeden Davet Et
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    Aktif tedarikçiler
                  </span>
                </div>
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

                <div className="mt-3">
                  {suppliersQuery.isLoading ? (
                    <p className="text-sm text-slate-500 text-center py-6">
                      Yükleniyor…
                    </p>
                  ) : candidates.length === 0 ? (
                    <div className="text-center py-6 px-4 space-y-1">
                      <p className="text-sm font-medium text-slate-600">
                        {alreadyInvitedSupplierIds.length > 0
                          ? "Davet edilebilecek başka tedarikçi yok"
                          : "Aktif tedarikçiniz yok"}
                      </p>
                      <p className="text-xs text-slate-400">
                        Tedarikçiler sayfasından davet gönderip ilişki
                        kurabilirsiniz.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
                      {candidates.map((s) => {
                        const id = s.supplier.id;
                        const checked = selectedIds.includes(id);
                        return (
                          <div
                            key={id}
                            className={cn(
                              "flex items-center gap-3 p-2.5 rounded-lg transition-colors ring-1",
                              checked
                                ? "bg-zinc-50 ring-zinc-950/15"
                                : "ring-transparent hover:bg-zinc-50",
                            )}
                          >
                            <Checkbox
                              checked={checked}
                              onChange={(c) => {
                                setSelectedIds((prev) =>
                                  c ? [...prev, id] : prev.filter((x) => x !== id),
                                );
                              }}
                            />
                            <div className="h-8 w-8 rounded-full bg-zinc-100 flex items-center justify-center shrink-0">
                              <Building2 className="h-4 w-4 text-zinc-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-zinc-900 truncate">
                                {s.supplier.companyName}
                              </p>
                              {s.supplier.city ? (
                                <p className="text-[11px] text-zinc-500 truncate">
                                  {s.supplier.city}
                                  {s.supplier.district
                                    ? ` · ${s.supplier.district}`
                                    : ""}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </section>

              {/* SECTION 3 — E-posta ile Davet Et (kayıtsız/bağlantısız) */}
              <section className="px-5 py-4 border-t border-surface-border bg-slate-50/40">
                <div className="flex items-center gap-2 mb-1">
                  <Mail className="w-4 h-4 text-brand-600" />
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    E-posta ile Davet Et
                  </h3>
                </div>
                <p className="text-xs text-slate-500 mb-3">
                  Listenizde olmayan bir firmayı e-posta ile bu ihaleye davet
                  edin. Kayıtlı değilse bile davet e-postasında ihale özetini
                  görür ve teklif vermek için kayıt olabilir.
                </p>

                <div className="space-y-2.5">
                  <Field>
                    <Label htmlFor="invite-email" className="sr-only">
                      E-posta
                    </Label>
                    <div className="relative">
                      <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      <Input
                        id="invite-email"
                        type="email"
                        placeholder="firma@ornek.com"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                  </Field>
                  <Field>
                    <Label htmlFor="invite-contact" className="sr-only">
                      İletişim adı (opsiyonel)
                    </Label>
                    <Input
                      id="invite-contact"
                      type="text"
                      placeholder="İletişim kişisi adı (opsiyonel)"
                      value={inviteContactName}
                      onChange={(e) => setInviteContactName(e.target.value)}
                    />
                  </Field>

                  <div className="flex items-center justify-end">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={handleEmailInvite}
                      disabled={!inviteEmail.trim() || emailMutation.isPending}
                      loading={emailMutation.isPending}
                    >
                      <Mail className="w-4 h-4" />
                      E-posta Daveti Gönder
                    </Button>
                  </div>

                  <div className="flex items-start gap-2 text-[11px] text-slate-500 bg-white border border-surface-border rounded-lg px-3 py-2">
                    <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />
                    <span>
                      Hiç kayıtlı olmayan firmalar kaydını tamamlayıp{" "}
                      <strong>admin onayından</strong> geçtikten sonra ihaleye
                      eklenir. Onay ihale kapanışından sonra gelirse teklif
                      veremez.
                    </span>
                  </div>
                </div>
              </section>
            </div>

            <footer className="px-5 py-4 border-t border-surface-border flex items-center justify-between gap-3">
              <p className="text-xs text-slate-500 flex items-center gap-1.5">
                <UserPlus className="w-3.5 h-3.5" />
                {selectedIds.length > 0
                  ? `${selectedIds.length} tedarikçi seçildi`
                  : "Yeni davet için tedarikçi seçin"}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleClose}
                  disabled={addMutation.isPending}
                >
                  Kapat
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
          </DialogPanel>
        </div>
      </Dialog>
    </>
  );
}
