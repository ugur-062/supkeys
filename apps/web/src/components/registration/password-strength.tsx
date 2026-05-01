"use client";

import { cn } from "@/lib/utils";
import { useMemo } from "react";

interface PasswordStrengthProps {
  password: string;
}

function scorePassword(pwd: string): number {
  if (!pwd) return 0;
  let score = 0;
  if (pwd.length >= 8) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[a-z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  return score;
}

export function PasswordStrength({ password }: PasswordStrengthProps) {
  const score = useMemo(() => scorePassword(password), [password]);

  const level = score === 0 ? 0 : score <= 2 ? 1 : score <= 3 ? 2 : 3;
  const label =
    level === 0 ? "" : level === 1 ? "Zayıf" : level === 2 ? "Orta" : "Güçlü";
  const color =
    level === 1
      ? "bg-danger-500"
      : level === 2
        ? "bg-warning-500"
        : level === 3
          ? "bg-success-500"
          : "bg-slate-200";
  const textColor =
    level === 1
      ? "text-danger-600"
      : level === 2
        ? "text-warning-600"
        : level === 3
          ? "text-success-600"
          : "text-slate-400";

  if (!password) return null;

  return (
    <div className="space-y-1.5 mt-2">
      <div className="flex gap-1.5">
        {[1, 2, 3].map((bar) => (
          <div
            key={bar}
            className={cn(
              "h-1.5 rounded-full flex-1 transition-all duration-300",
              level >= bar ? color : "bg-slate-200",
            )}
          />
        ))}
      </div>
      {label ? (
        <p className={cn("text-xs font-medium", textColor)}>
          Şifre gücü: {label}
        </p>
      ) : null}
    </div>
  );
}
