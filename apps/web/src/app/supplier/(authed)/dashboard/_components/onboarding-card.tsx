"use client";

import { Button } from "@/components/ui/button";
import { useSupplierAuth } from "@/hooks/use-supplier-auth";
import { cn } from "@/lib/utils";
import { ArrowRight, CheckCircle2, Circle } from "lucide-react";
import Link from "next/link";

interface Step {
  title: string;
  description: string;
  completed: boolean;
  cta: { label: string; href?: string; disabled?: boolean };
}

export function SupplierOnboardingCard() {
  const { tenantRelations } = useSupplierAuth();
  const hasRelation = tenantRelations.length > 0;

  const steps: Step[] = [
    {
      title: "Profilini Tamamla",
      description: "Firma bilgilerinizi gözden geçirin, eksikleri tamamlayın.",
      completed: false,
      cta: { label: "Profile Git", href: "/supplier/profil" },
    },
    {
      title: "Müşterilerinle Bağlantı Kur",
      description:
        "Aldığın davet kodlarıyla yeni alıcı firmalara bağlan, ağını genişlet.",
      completed: hasRelation,
      cta: { label: "Bağlantıları Görüntüle", href: "/supplier/profil" },
    },
    {
      title: "İhalelere Katıl",
      description:
        "Bağlı olduğun alıcıların açtığı ihalelere teklif ver, sipariş kazan.",
      completed: false,
      cta: { label: "Yakında", disabled: true },
    },
  ];

  const completed = steps.filter((s) => s.completed).length;

  return (
    <section className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 via-white to-indigo-50/40 p-6">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="font-display font-bold text-lg text-brand-900">
            Başlangıç Rehberi
          </h2>
          <p className="text-sm text-slate-600 mt-0.5">
            Tedarikçi panelini en iyi şekilde kullanmak için sıradaki adımlar.
          </p>
        </div>
        <span className="px-2.5 py-1 rounded-full bg-white border border-brand-200 text-xs font-semibold text-brand-700 tabular-nums whitespace-nowrap">
          {completed} / {steps.length}
        </span>
      </div>

      <ol className="space-y-3">
        {steps.map((step, idx) => (
          <li
            key={step.title}
            className={cn(
              "rounded-xl border bg-white p-4",
              "flex items-center gap-4",
              step.completed
                ? "border-success-500/30 bg-success-50/40"
                : "border-surface-border",
            )}
          >
            <div className="shrink-0">
              {step.completed ? (
                <CheckCircle2 className="h-6 w-6 text-success-600" />
              ) : (
                <Circle className="h-6 w-6 text-slate-300" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p
                className={cn(
                  "text-sm font-semibold",
                  step.completed
                    ? "text-success-700 line-through decoration-success-500/40"
                    : "text-brand-900",
                )}
              >
                {idx + 1}. {step.title}
              </p>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                {step.description}
              </p>
            </div>
            <div className="shrink-0">
              {step.cta.disabled ? (
                <Button variant="secondary" size="sm" disabled>
                  {step.cta.label}
                </Button>
              ) : step.cta.href ? (
                <Link href={step.cta.href}>
                  <Button variant="secondary" size="sm">
                    {step.cta.label}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
