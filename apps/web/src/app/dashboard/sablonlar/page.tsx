import { PermissionGuard } from "@/components/auth/permission-guard";
import { ArrowRight, ListChecks, Users } from "lucide-react";
import Link from "next/link";

export const metadata = {
  title: "Şablonlar — Supkeys",
};

const TEMPLATES = [
  {
    href: "/dashboard/sablonlar/kalem-sorusu",
    label: "Kalem Sorusu Şablonları",
    description:
      "Sık sorduğunuz kalem sorularını şablona kaydedin, ihale wizard'ında tek tıkla uygulayın.",
    icon: ListChecks,
  },
  {
    href: "/dashboard/sablonlar/tedarikci",
    label: "Tedarikçi Şablonları",
    description:
      "Birlikte davet ettiğiniz tedarikçi gruplarını şablonlayın, ihale açarken zaman kazanın.",
    icon: Users,
  },
];

export default function SablonlarPage() {
  return (
    <PermissionGuard permission="templates:view">
      <div className="max-w-4xl mx-auto space-y-6">
        <header>
          <h1 className="font-display font-bold text-2xl md:text-3xl text-brand-900">
            Şablonlar
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            İhale açarken tekrar tekrar girdiğiniz verileri bir kez şablonlayın
            ve hızla uygulayın.
          </p>
        </header>

        <ul className="space-y-3">
          {TEMPLATES.map((t) => (
            <li key={t.href}>
              <Link
                href={t.href}
                className="card group flex items-center gap-4 p-5 hover:border-brand-300 hover:shadow-md transition-all"
              >
                <div className="h-10 w-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0 group-hover:bg-brand-100">
                  <t.icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-brand-900">{t.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{t.description}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-brand-600 group-hover:translate-x-0.5 transition-all" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </PermissionGuard>
  );
}
