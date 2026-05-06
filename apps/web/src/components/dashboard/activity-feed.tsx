"use client";

import { cn } from "@/lib/utils";
import { formatDistanceToNowStrict } from "date-fns";
import { tr } from "date-fns/locale";
import {
  Building2,
  FileText,
  Mail,
  Package,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

interface ActivityRow {
  href: string;
  icon: LucideIcon;
  iconBgClass: string;
  iconClass: string;
  label: string;
  sublabel?: string;
  timestamp: string;
}

interface Props {
  rows: ActivityRow[];
  emptyMessage?: string;
  emptyIcon?: LucideIcon;
}

export function ActivityFeed({
  rows,
  emptyMessage = "Henüz aktivite yok",
  emptyIcon: EmptyIcon = FileText,
}: Props) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
          <EmptyIcon className="w-6 h-6 text-slate-400" />
        </div>
        <p className="text-sm text-slate-500 mt-3">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((row, idx) => (
        <Link
          key={`${row.href}-${idx}`}
          href={row.href}
          className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-50 text-left transition group"
        >
          <div
            className={cn(
              "h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0",
              row.iconBgClass,
            )}
          >
            <row.icon className={cn("h-5 w-5", row.iconClass)} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-brand-900 group-hover:text-brand-700 truncate">
              {row.label}
            </p>
            {row.sublabel ? (
              <p className="text-xs text-slate-500 mt-0.5 truncate">
                {row.sublabel}
              </p>
            ) : null}
          </div>
          <p className="text-xs text-slate-400 flex-shrink-0 whitespace-nowrap pt-1">
            {formatRelative(row.timestamp)}
          </p>
        </Link>
      ))}
    </div>
  );
}

function formatRelative(iso: string): string {
  try {
    return formatDistanceToNowStrict(new Date(iso), {
      addSuffix: true,
      locale: tr,
    });
  } catch {
    return "";
  }
}

// Kullanılmayan import uyarılarını engellemek için (icon set sağlandı)
void Building2;
void Mail;
void Package;
void TrendingUp;
