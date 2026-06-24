"use client";

import { useTenantPublicProfile } from "@/hooks/use-tenant-public-profile";
import { useTenantUserMe } from "@/hooks/use-tenant-users";
import { cn } from "@/lib/utils";
import { ChevronDown, Copy, FileText, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { BackToSettings } from "./back-to-settings";
import { TenantPublicProfileCard } from "./tenant-public-profile-card";
import { TenantCategoriesCard } from "./tenant-categories-card";

function SupkeysIdRow() {
  const { data } = useTenantPublicProfile();
  const display = data?.supkeysId ? `SK-${data.supkeysId}` : "—";
  const copy = () => {
    if (!data?.supkeysId) return;
    navigator.clipboard
      .writeText(display)
      .then(() => toast.success("Supkeys ID kopyalandı"))
      .catch(() => toast.error("Kopyalanamadı"));
  };
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-zinc-950/5 bg-white p-4 text-sm">
      <span className="font-semibold text-zinc-900">Supkeys ID'niz:</span>
      <code className="rounded-md bg-zinc-100 px-2 py-0.5 font-mono font-semibold text-zinc-900">
        {display}
      </code>
      {data?.supkeysId ? (
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-600 hover:text-zinc-900"
        >
          <Copy className="h-3.5 w-3.5" />
          Kopyala
        </button>
      ) : null}
      <span className="text-xs text-slate-400">
        — tedarikçiler bu ID ile sizi ekleyebilir.
      </span>
    </div>
  );
}

export function FirmaProfiliView() {
  const meQuery = useTenantUserMe();

  if (meQuery.isLoading || !meQuery.data) {
    return (
      <div className="mx-auto flex max-w-4xl items-center justify-center px-6 py-12 text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Yükleniyor…
      </div>
    );
  }

  const tenant = meQuery.data.tenant;

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <BackToSettings />

      <h1 className="mt-4 text-2xl font-semibold text-brand-900">
        Firma Profili
      </h1>

      {/* Faz 3 madde 6 — kalıcı Supkeys ID */}
      <SupkeysIdRow />

      {/* Herkese açık profil editörü */}
      <div className="mt-6">
        <TenantPublicProfileCard
          isAdmin={meQuery.data.role === "COMPANY_ADMIN"}
        />
      </div>

      {/* Akordiyonlar */}
      <div className="mt-6 space-y-3">
        <Accordion title="Tanıtım Bilgileri" defaultOpen>
          <p className="text-sm text-slate-500">
            Tanıtım metni henüz eklenmemiş.
          </p>
        </Accordion>

        <Accordion title="Faaliyet Kategorileri" defaultOpen>
          <TenantCategoriesCard
            canEdit={meQuery.data.role === "COMPANY_ADMIN"}
          />
        </Accordion>

        <Accordion title="Vergi Bilgileri" defaultOpen>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <InfoPair
              label="Vergi Numarası"
              value={tenant.taxNumber || "—"}
              mono
            />
            <InfoPair label="Vergi Dairesi" value={tenant.taxOffice || "—"} />
          </div>
          {tenant.taxCertUrl ? (
            <div className="mt-4">
              <span className="font-bold text-slate-700">Vergi Levhası: </span>
              <a
                href={tenant.taxCertUrl}
                target="_blank"
                rel="noreferrer"
                download
                className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 underline-offset-2 hover:text-brand-700 hover:underline"
              >
                <FileText className="h-4 w-4" />
                Vergi Levhası
                <span aria-hidden>⬇</span>
              </a>
            </div>
          ) : null}
        </Accordion>

        <Accordion title="İletişim Bilgileri" defaultOpen>
          <h3 className="mb-3 text-sm font-bold text-brand-900">
            İletişim Adresi
          </h3>
          <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/40 p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <InfoPair label="Ülke" value="Türkiye" />
              <InfoPair label="İl" value={tenant.city || "—"} />
              <InfoPair label="İlçe" value={tenant.district || "—"} />
            </div>
            <InfoPair
              label="Posta Kodu"
              value={tenant.postalCode || "—"}
              mono
            />
            <InfoPair
              label="Adres (Mahalle, Sokak)"
              value={tenant.addressLine || "—"}
              required
            />
          </div>
        </Accordion>

        <Accordion title="Telefon Bilgileri" defaultOpen>
          <p className="text-sm text-slate-500">
            Henüz telefon bilgisi eklenmemiş.
          </p>
        </Accordion>
      </div>

      {/* Destek notu */}
      <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50/40 p-4 text-xs text-slate-500">
        Firma bilgilerinizi değiştirmek için Supkeys destek ekibi ile iletişime
        geçebilirsiniz:{" "}
        <a
          href="mailto:destek@supkeys.com"
          className="font-medium text-brand-600 hover:underline"
        >
          destek@supkeys.com
        </a>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Subcomponents
// ──────────────────────────────────────────────────────────

interface AccordionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function Accordion({ title, defaultOpen = false, children }: AccordionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-slate-50/50",
          "focus:outline-none focus-visible:bg-slate-50",
        )}
      >
        <ChevronDown
          className={cn(
            "h-5 w-5 flex-shrink-0 text-slate-500 transition-transform duration-200",
            open ? "rotate-0" : "-rotate-90",
          )}
        />
        <h2 className="text-base font-semibold text-brand-900">
          {title}
        </h2>
      </button>
      {open ? (
        <div className="border-t border-slate-100 px-5 py-4">{children}</div>
      ) : null}
    </section>
  );
}


interface InfoPairProps {
  label: string;
  value: string;
  mono?: boolean;
  required?: boolean;
}

function InfoPair({ label, value, mono, required }: InfoPairProps) {
  return (
    <div>
      <p className="text-sm">
        <span className="font-bold text-slate-700">
          {label}
          {required ? <span className="text-danger-500">*</span> : null}:{" "}
        </span>
        <span
          className={cn("text-slate-900", mono ? "font-mono" : "font-normal")}
        >
          {value}
        </span>
      </p>
    </div>
  );
}
