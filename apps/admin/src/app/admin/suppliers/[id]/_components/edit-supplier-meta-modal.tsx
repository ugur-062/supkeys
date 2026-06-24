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
  useUpdateAdminSupplier,
  type AdminSupplierDetail,
  type UpdateSupplierPayload,
} from "@/hooks/use-admin-suppliers";
import { Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  supplier: AdminSupplierDetail;
}

type Form = {
  companyName: string;
  taxNumber: string;
  taxOffice: string;
  industry: string;
  website: string;
  city: string;
  district: string;
  addressLine: string;
  postalCode: string;
};

function toForm(s: AdminSupplierDetail): Form {
  return {
    companyName: s.companyName ?? "",
    taxNumber: s.taxNumber ?? "",
    taxOffice: s.taxOffice ?? "",
    industry: s.industry ?? "",
    website: s.website ?? "",
    city: s.city ?? "",
    district: s.district ?? "",
    addressLine: s.addressLine ?? "",
    postalCode: s.postalCode ?? "",
  };
}

export function EditSupplierMetaModal({ open, onClose, supplier }: Props) {
  const mutation = useUpdateAdminSupplier(supplier.id);
  const [form, setForm] = useState<Form>(() => toForm(supplier));

  useEffect(() => {
    if (open) setForm(toForm(supplier));
  }, [open, supplier]);

  const submit = () => {
    const payload: UpdateSupplierPayload = {};
    if (form.companyName.trim() !== (supplier.companyName ?? "")) {
      payload.companyName = form.companyName.trim();
    }
    const optional: Array<{
      key: keyof Form;
      original: string | null;
      payloadKey: keyof UpdateSupplierPayload;
      nullable: boolean;
    }> = [
      { key: "taxNumber", original: supplier.taxNumber, payloadKey: "taxNumber", nullable: true },
      { key: "taxOffice", original: supplier.taxOffice, payloadKey: "taxOffice", nullable: false },
      { key: "industry", original: supplier.industry, payloadKey: "industry", nullable: true },
      { key: "website", original: supplier.website, payloadKey: "website", nullable: true },
      { key: "city", original: supplier.city, payloadKey: "city", nullable: false },
      { key: "district", original: supplier.district, payloadKey: "district", nullable: false },
      { key: "addressLine", original: supplier.addressLine, payloadKey: "addressLine", nullable: false },
      { key: "postalCode", original: supplier.postalCode, payloadKey: "postalCode", nullable: true },
    ];
    for (const f of optional) {
      const current = form[f.key].trim();
      const orig = f.original ?? "";
      if (current === orig) continue;
      (payload as Record<string, unknown>)[f.payloadKey] =
        current === "" ? (f.nullable ? null : "") : current;
    }
    if (Object.keys(payload).length === 0) {
      onClose();
      return;
    }
    mutation.mutate(payload, {
      onSuccess: () => {
        toast.success("Tedarikçi bilgileri güncellendi");
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
          <DialogTitle>Tedarikçi Bilgilerini Düzenle</DialogTitle>
          <DialogDescription>
            Firma adı, VKN ve adres alanlarını güncelle.
          </DialogDescription>
        </div>
      </div>

      <DialogBody className="space-y-3">
        <Row label="Firma Adı">
          <Field
            value={form.companyName}
            onChange={(v) => setField("companyName", v)}
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
        <div className="grid grid-cols-2 gap-3">
          <Row label="Sektör">
            <Field
              value={form.industry}
              onChange={(v) => setField("industry", v)}
              placeholder="İnşaat, üretim, ..."
            />
          </Row>
          <Row label="Web Sitesi">
            <Field
              value={form.website}
              onChange={(v) => setField("website", v)}
              placeholder="https://..."
            />
          </Row>
        </div>
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
