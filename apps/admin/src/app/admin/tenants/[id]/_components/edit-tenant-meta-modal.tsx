"use client";

import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Input as CatalystInput } from "@/components/catalyst/input";
import { Textarea } from "@/components/catalyst/textarea";
import { Button } from "@/components/ui/button";
import {
  useUpdateAdminTenant,
  type AdminTenantDetail,
  type UpdateAdminTenantPayload,
} from "@/hooks/use-admin-tenants";
import { Pencil } from "lucide-react";
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
    <Dialog
      open={open}
      onClose={() => {
        if (!mutation.isPending) onClose();
      }}
      size="2xl"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-zinc-100">
          <Pencil className="h-5 w-5 text-zinc-600" />
        </div>
        <div>
          <DialogTitle>Tenant Bilgilerini Düzenle</DialogTitle>
          <DialogDescription>
            Firma adı, VKN ve adres alanlarını güncelle.
          </DialogDescription>
        </div>
      </div>

      <DialogBody className="space-y-3">
        <Row label="Firma Adı">
          <Field
            value={form.name}
            onChange={(v) => setField("name", v)}
            placeholder="Firma adı"
          />
        </Row>
        <div className="grid grid-cols-2 gap-3">
          <Row label="VKN / TCKN">
            <Field
              value={form.taxNumber}
              onChange={(v) => setField("taxNumber", v)}
              placeholder="10 veya 11 hane"
            />
          </Row>
          <Row label="Vergi Dairesi">
            <Field
              value={form.taxOffice}
              onChange={(v) => setField("taxOffice", v)}
              placeholder="Beşiktaş VD"
            />
          </Row>
        </div>
        <Row label="Sektör">
          <Field
            value={form.industry}
            onChange={(v) => setField("industry", v)}
            placeholder="İnşaat, üretim, ..."
          />
        </Row>
        <div className="grid grid-cols-2 gap-3">
          <Row label="Şehir">
            <Field
              value={form.city}
              onChange={(v) => setField("city", v)}
              placeholder="İstanbul"
            />
          </Row>
          <Row label="İlçe">
            <Field
              value={form.district}
              onChange={(v) => setField("district", v)}
              placeholder="Beşiktaş"
            />
          </Row>
        </div>
        <Row label="Açık Adres">
          <Textarea
            value={form.addressLine}
            onChange={(e) => setField("addressLine", e.target.value)}
            rows={2}
          />
        </Row>
        <Row label="Posta Kodu">
          <Field
            value={form.postalCode}
            onChange={(v) => setField("postalCode", v)}
            placeholder="34000"
          />
        </Row>
      </DialogBody>

      <DialogActions>
        <Button
          type="button"
          variant="ghost"
          onClick={onClose}
          disabled={mutation.isPending}
        >
          Vazgeç
        </Button>
        <Button type="button" onClick={submit} disabled={mutation.isPending}>
          {mutation.isPending ? "Kaydediliyor..." : "Kaydet"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function Field({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <CatalystInput
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  );
}
