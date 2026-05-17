"use client";

import {
  useUpdateAdminTenant,
  type AdminTenantDetail,
  type UpdateAdminTenantPayload,
} from "@/hooks/use-admin-tenants";
import { cn } from "@/lib/utils";
import * as Dialog from "@radix-ui/react-dialog";
import { Pencil, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  tenant: AdminTenantDetail;
}

type Form = {
  name: string;
  taxNumber: string;
  taxOffice: string;
  industry: string;
  city: string;
  district: string;
  addressLine: string;
  postalCode: string;
};

function toForm(t: AdminTenantDetail): Form {
  return {
    name: t.name ?? "",
    taxNumber: t.taxNumber ?? "",
    taxOffice: t.taxOffice ?? "",
    industry: t.industry ?? "",
    city: t.city ?? "",
    district: t.district ?? "",
    addressLine: t.addressLine ?? "",
    postalCode: t.postalCode ?? "",
  };
}

export function EditTenantMetaModal({ open, onClose, tenant }: Props) {
  const mutation = useUpdateAdminTenant(tenant.id);
  const [form, setForm] = useState<Form>(() => toForm(tenant));

  useEffect(() => {
    if (open) setForm(toForm(tenant));
  }, [open, tenant]);

  const submit = () => {
    const payload: UpdateAdminTenantPayload = {};
    if (form.name.trim() !== (tenant.name ?? "")) {
      payload.name = form.name.trim();
    }
    const optional: Array<{
      key: keyof Form;
      original: string | null;
      payloadKey: keyof UpdateAdminTenantPayload;
    }> = [
      { key: "taxNumber", original: tenant.taxNumber, payloadKey: "taxNumber" },
      { key: "taxOffice", original: tenant.taxOffice, payloadKey: "taxOffice" },
      { key: "industry", original: tenant.industry, payloadKey: "industry" },
      { key: "city", original: tenant.city, payloadKey: "city" },
      { key: "district", original: tenant.district, payloadKey: "district" },
      {
        key: "addressLine",
        original: tenant.addressLine,
        payloadKey: "addressLine",
      },
      {
        key: "postalCode",
        original: tenant.postalCode,
        payloadKey: "postalCode",
      },
    ];
    for (const f of optional) {
      const current = form[f.key].trim();
      const orig = f.original ?? "";
      if (current === orig) continue;
      (payload as Record<string, unknown>)[f.payloadKey] =
        current === "" ? null : current;
    }
    if (Object.keys(payload).length === 0) {
      onClose();
      return;
    }
    mutation.mutate(payload, {
      onSuccess: () => {
        toast.success("Tenant bilgileri güncellendi");
        onClose();
      },
      onError: (err: unknown) => {
        toast.error(err instanceof Error ? err.message : "Güncelleme hatası");
      },
    });
  };

  const setField = (key: keyof Form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o && !mutation.isPending) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-slate-900/60" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-[60] -translate-x-1/2 -translate-y-1/2",
            "flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl outline-none",
          )}
        >
          <header className="flex items-start justify-between gap-3 border-b border-surface-border px-5 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand-50">
                <Pencil className="h-5 w-5 text-brand-600" />
              </div>
              <div>
                <Dialog.Title className="font-display text-lg font-bold text-admin-text">
                  Tenant Bilgilerini Düzenle
                </Dialog.Title>
                <Dialog.Description className="mt-0.5 text-sm text-admin-text-muted">
                  Firma adı, VKN ve adres alanlarını güncelle.
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Kapat"
                disabled={mutation.isPending}
                className="flex-shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-surface-muted hover:text-slate-600 disabled:opacity-40"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto px-5 py-5">
            <Row label="Firma Adı">
              <Input
                value={form.name}
                onChange={(v) => setField("name", v)}
                placeholder="Firma adı"
              />
            </Row>
            <div className="grid grid-cols-2 gap-3">
              <Row label="VKN / TCKN">
                <Input
                  value={form.taxNumber}
                  onChange={(v) => setField("taxNumber", v)}
                  placeholder="10 veya 11 hane"
                />
              </Row>
              <Row label="Vergi Dairesi">
                <Input
                  value={form.taxOffice}
                  onChange={(v) => setField("taxOffice", v)}
                  placeholder="Beşiktaş VD"
                />
              </Row>
            </div>
            <Row label="Sektör">
              <Input
                value={form.industry}
                onChange={(v) => setField("industry", v)}
                placeholder="İnşaat, üretim, ..."
              />
            </Row>
            <div className="grid grid-cols-2 gap-3">
              <Row label="Şehir">
                <Input
                  value={form.city}
                  onChange={(v) => setField("city", v)}
                  placeholder="İstanbul"
                />
              </Row>
              <Row label="İlçe">
                <Input
                  value={form.district}
                  onChange={(v) => setField("district", v)}
                  placeholder="Beşiktaş"
                />
              </Row>
            </div>
            <Row label="Açık Adres">
              <textarea
                value={form.addressLine}
                onChange={(e) => setField("addressLine", e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </Row>
            <Row label="Posta Kodu">
              <Input
                value={form.postalCode}
                onChange={(v) => setField("postalCode", v)}
                placeholder="34000"
              />
            </Row>
          </div>

          <footer className="flex items-center gap-2 border-t border-surface-border px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              disabled={mutation.isPending}
              className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-admin-text transition hover:bg-slate-50 disabled:opacity-50"
            >
              Vazgeç
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={mutation.isPending}
              className="flex-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
            >
              {mutation.isPending ? "Kaydediliyor..." : "Kaydet"}
            </button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-admin-text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

function Input({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
    />
  );
}
