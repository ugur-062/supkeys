"use client";

import { ChevronRight, ShieldAlert, ShieldCheck } from "lucide-react";
import Link from "next/link";

/**
 * Madde 29 — FAZ 3.0 doğrulama kapısının sunum katmanı. Alıcı ve tedarikçi
 * kapıları (VerificationGate / SupplierVerificationGate) aynı görünümü
 * paylaşır; veri okuma ve yönlendirme sarmalayıcılarda yapılır.
 */
export interface GateRequirement {
  done: boolean;
  title: string;
  hint: string;
  href: string;
}

export function VerificationGateView({
  title,
  description,
  requirements,
  onBack,
  backLabel = "Panele dön",
}: {
  title: string;
  description: string;
  requirements: GateRequirement[];
  onBack: () => void;
  backLabel?: string;
}) {
  return (
    <div className="mx-auto max-w-xl px-6 py-10">
      <div className="rounded-2xl border border-zinc-950/10 bg-white p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50">
          <ShieldAlert className="h-6 w-6 text-amber-600" />
        </div>
        <h1 className="text-lg font-bold text-zinc-900">{title}</h1>
        <p className="mt-1 text-sm text-zinc-500">{description}</p>

        <div className="mt-6 space-y-3 text-left">
          {requirements.map((r) => (
            <RequirementRow key={r.href} {...r} />
          ))}
        </div>

        <button
          type="button"
          onClick={onBack}
          className="mt-6 text-sm font-medium text-zinc-500 hover:text-zinc-800"
        >
          {backLabel}
        </button>
      </div>
    </div>
  );
}

function RequirementRow({ done, title, hint, href }: GateRequirement) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl border border-zinc-950/10 p-4 transition-colors hover:bg-zinc-50"
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
          done
            ? "bg-success-100 text-success-700"
            : "bg-zinc-100 text-zinc-400"
        }`}
      >
        <ShieldCheck className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-zinc-900">{title}</p>
        <p className="text-xs text-zinc-500">{hint}</p>
      </div>
      {!done ? (
        <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-zinc-600">
          Aç <ChevronRight className="h-4 w-4" />
        </span>
      ) : null}
    </Link>
  );
}
