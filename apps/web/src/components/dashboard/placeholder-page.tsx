"use client";

import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  BarChart3,
  CheckSquare,
  FileText,
  type LucideIcon,
  MessageSquare,
  Package,
  Plus,
  Settings,
  Sparkles,
  User,
  Users,
} from "lucide-react";
import Link from "next/link";

const ICON_MAP = {
  ihaleler: FileText,
  "ihaleler-yeni": Plus,
  teklifler: MessageSquare,
  "onay-bekleyenler": CheckSquare,
  siparisler: Package,
  tedarikciler: Users,
  raporlar: BarChart3,
  ayarlar: Settings,
  profil: User,
} satisfies Record<string, LucideIcon>;

export type PlaceholderIconKey = keyof typeof ICON_MAP;

interface PlaceholderPageProps {
  iconKey: PlaceholderIconKey;
  title: string;
  subtitle: string;
  description?: string;
  estimatedRelease?: string;
  highlights?: string[];
}

export function PlaceholderPage({
  iconKey,
  title,
  subtitle,
  description,
  estimatedRelease = "V2",
  highlights,
}: PlaceholderPageProps) {
  const Icon = ICON_MAP[iconKey] ?? FileText;

  return (
    <div className="max-w-3xl mx-auto">
      <section
        className={cn(
          "card p-8 md:p-12 text-center",
          "bg-gradient-to-b from-white to-surface-subtle/40",
        )}
      >
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-100 text-slate-300 mb-5">
          <Icon className="w-8 h-8" />
        </div>

        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-warning-50 text-warning-700 border border-warning-500/20 text-xs font-semibold uppercase tracking-wide mb-4">
          <Sparkles className="w-3.5 h-3.5" />
          Yakında · {estimatedRelease}
        </div>

        <h1 className="font-display font-bold text-3xl md:text-4xl text-brand-900">
          {title}
        </h1>
        <p className="text-slate-600 mt-2 max-w-xl mx-auto">{subtitle}</p>

        {description && (
          <p className="text-sm text-slate-500 mt-4 max-w-xl mx-auto leading-relaxed">
            {description}
          </p>
        )}

        {highlights && highlights.length > 0 && (
          <div className="mt-7 pt-6 border-t border-surface-border max-w-md mx-auto text-left">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3 text-center">
              Neler gelecek?
            </h3>
            <ul className="space-y-2">
              {highlights.map((h) => (
                <li
                  key={h}
                  className="flex items-start gap-2 text-sm text-slate-700"
                >
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0" />
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-8">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-800 hover:underline"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Dashboard&apos;a dön
          </Link>
        </div>
      </section>
    </div>
  );
}
