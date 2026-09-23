"use client";

import type { PasswordRule } from "@/lib/company-auth/password-rules";
import { Check, X } from "lucide-react";

/** Şifre gücü çubuğu + kural listesi (kayıt ve davet kabul formları). */
export function PasswordStrength({
  password,
  rules,
  score,
  label,
  live = false,
}: {
  password: string;
  rules: PasswordRule[];
  score: number;
  label: string;
  live?: boolean;
}) {
  return (
    <div className="space-y-1.5" role={live ? "status" : undefined} aria-live={live ? "polite" : undefined}>
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
          <div
            className={`h-full transition-all ${
              score <= 2 ? "bg-red-500" : score <= 4 ? "bg-amber-500" : "bg-emerald-500"
            }`}
            style={{ width: `${(score / rules.length) * 100}%` }}
          />
        </div>
        <span className="text-xs font-medium text-zinc-600">{label}</span>
      </div>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
        {rules.map((r) => {
          const ok = r.test(password);
          return (
            <li key={r.key} className={`flex items-center gap-1 text-xs ${ok ? "text-emerald-600" : "text-zinc-400"}`}>
              {ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
              {r.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
