"use client";

import { useTenantUserMe } from "@/hooks/use-tenant-users";
import { cn } from "@/lib/utils";
import {
  Ban,
  Building2,
  ChevronDown,
  FileText,
  Loader2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BackToSettings } from "./back-to-settings";

const COMPANY_TYPE_LABEL: Record<string, string> = {
  JOINT_STOCK: "Anonim Şirket",
  LIMITED: "Limited Şirket",
  SOLE_PROPRIETOR: "Şahıs Şirketi",
};

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
  const companyTypeLabel = tenant.companyType
    ? COMPANY_TYPE_LABEL[tenant.companyType] ?? tenant.companyType
    : "—";

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <BackToSettings />

      <h1 className="mt-4 font-display text-2xl font-bold text-brand-900">
        Firma Profili
      </h1>

      {/* Üst özet kart */}
      <SummaryCard
        name={tenant.name}
        taxNumber={tenant.taxNumber}
        companyTypeLabel={companyTypeLabel}
      />

      {/* Akordiyonlar */}
      <div className="mt-6 space-y-3">
        <Accordion title="Tanıtım Bilgileri" defaultOpen>
          <p className="text-sm text-slate-500">
            Tanıtım metni henüz eklenmemiş.
          </p>
        </Accordion>

        <Accordion title="Kategori Bilgileri" defaultOpen>
          <NestedCategoryAccordion />
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

interface SummaryCardProps {
  name: string;
  taxNumber: string | null;
  companyTypeLabel: string;
}

function SummaryCard({ name, taxNumber, companyTypeLabel }: SummaryCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-brand-50">
            <Building2 className="h-7 w-7 text-brand-600" />
          </div>
          <div>
            <p className="text-xl font-bold text-brand-900">{name}</p>
            {taxNumber ? (
              <p className="mt-0.5 font-mono text-xs text-slate-500">
                {taxNumber}
              </p>
            ) : null}
            <p className="mt-3 text-sm text-slate-700">
              <span className="font-bold">Firma Tipi:</span>{" "}
              <span>{companyTypeLabel}</span>
            </p>
          </div>
        </div>

        {/* Tüm İşlemler dropdown */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-colors",
              "bg-brand-500 text-white hover:bg-brand-600",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30",
            )}
          >
            Tüm İşlemler
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform",
                menuOpen ? "rotate-180" : "",
              )}
            />
          </button>
          {menuOpen ? (
            <div
              role="menu"
              className="absolute right-0 z-10 mt-2 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger-600 hover:bg-danger-50"
              >
                <Ban className="h-4 w-4" />
                Engelle
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

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
        <h2 className="font-display text-base font-bold text-brand-900">
          {title}
        </h2>
      </button>
      {open ? (
        <div className="border-t border-slate-100 px-5 py-4">{children}</div>
      ) : null}
    </section>
  );
}

function NestedCategoryAccordion() {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-slate-50"
      >
        <ChevronDown
          className={cn(
            "h-4 w-4 flex-shrink-0 text-slate-400 transition-transform duration-200",
            open ? "rotate-0" : "-rotate-90",
          )}
        />
        <span className="flex-1 text-sm font-medium text-slate-700">
          A. Ham Maddeler, Kimyasallar, Kağıt, Yakıt
        </span>
        <span className="text-xs text-slate-400">
          (1 ana kategori seçili)
        </span>
      </button>
      {open ? (
        <p className="ml-6 mt-2 text-xs text-slate-500">
          Alt kategori seçimi V2-7'de aktif olacak.
        </p>
      ) : null}
    </div>
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
