"use client";

import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import type { FullRegistration } from "@/lib/registration/schemas";
import { ShieldCheck } from "lucide-react";
import {
  type Control,
  Controller,
  type UseFormSetValue,
} from "react-hook-form";
import { FileUpload } from "./file-upload";

// G9 madde 27 — "Tedarikçi Ol" (CONNECT_REQUEST) başvurusunda zorunlu KYC
// belgeleri. Admin başvuru detayında inceler.
const DOCS = [
  { name: "ticariSicilUrl", label: "Ticari Sicil Gazetesi" },
  { name: "imzaSirkuleriUrl", label: "İmza Sirküleri" },
  { name: "bankaOnayliIbanUrl", label: "Banka Onaylı IBAN" },
] as const;

export function ConnectKycUploads({
  control,
  setValue,
  tenantName,
}: {
  control: Control<FullRegistration>;
  setValue: UseFormSetValue<FullRegistration>;
  tenantName?: string;
}) {
  return (
    <div className="card p-5 space-y-4 border-zinc-200 bg-zinc-50/30">
      <div className="flex items-start gap-2">
        <ShieldCheck className="h-5 w-5 text-zinc-600 flex-shrink-0 mt-0.5" />
        <div>
          <h3 className="font-semibold text-zinc-900">Doğrulama Belgeleri</h3>
          <p className="text-xs text-slate-600 mt-0.5">
            {tenantName ? `${tenantName} ` : ""}tedarikçi başvurusunda aşağıdaki
            belgeler zorunludur (admin tarafından doğrulanır).
          </p>
        </div>
      </div>
      {DOCS.map((d) => (
        <Field key={d.name}>
          <Label required>{d.label}</Label>
          <Controller
            control={control}
            name={d.name}
            render={({ field }) => (
              <FileUpload
                value={field.value || null}
                onChange={(v) => {
                  setValue(d.name, v ?? "", { shouldValidate: true });
                  field.onChange(v ?? "");
                }}
              />
            )}
          />
        </Field>
      ))}
    </div>
  );
}
