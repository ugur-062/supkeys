"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  EMAIL_STATUS_META,
  EMAIL_STATUS_ORDER,
  EMAIL_TEMPLATE_LABELS,
} from "@/lib/email-logs/status";
import type { EmailLogStatus } from "@/lib/email-logs/types";
import { cn } from "@/lib/utils";
import { Search, X } from "lucide-react";
import { useEffect, useState } from "react";

interface FiltersBarProps {
  toEmail: string;
  status: EmailLogStatus | "";
  template: string;
  onToEmailChange: (value: string) => void;
  onStatusChange: (value: EmailLogStatus | "") => void;
  onTemplateChange: (value: string) => void;
  onClear: () => void;
}

export function FiltersBar({
  toEmail,
  status,
  template,
  onToEmailChange,
  onStatusChange,
  onTemplateChange,
  onClear,
}: FiltersBarProps) {
  const [emailInput, setEmailInput] = useState(toEmail);

  useEffect(() => {
    setEmailInput(toEmail);
  }, [toEmail]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (emailInput !== toEmail) {
        onToEmailChange(emailInput);
      }
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailInput]);

  const hasFilters = !!toEmail || !!status || !!template;

  const selectClass = cn(
    "px-3.5 py-2.5 rounded-lg border bg-white text-admin-text text-sm",
    "border-admin-border-strong focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500",
  );

  return (
    <div className="admin-card p-3 flex flex-col md:flex-row md:items-center gap-3">
      <div className="relative flex-1 min-w-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          type="search"
          placeholder="Alıcı e-posta ara…"
          value={emailInput}
          onChange={(e) => setEmailInput(e.target.value)}
          className="pl-9"
        />
      </div>

      <select
        value={status}
        onChange={(e) =>
          onStatusChange(e.target.value as EmailLogStatus | "")
        }
        className={cn(selectClass, "min-w-[160px]")}
      >
        <option value="">Tüm durumlar</option>
        {EMAIL_STATUS_ORDER.map((s) => (
          <option key={s} value={s}>
            {EMAIL_STATUS_META[s].label}
          </option>
        ))}
      </select>

      <select
        value={template}
        onChange={(e) => onTemplateChange(e.target.value)}
        className={cn(selectClass, "min-w-[220px]")}
      >
        <option value="">Tüm şablonlar</option>
        {Object.entries(EMAIL_TEMPLATE_LABELS).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>

      <Button
        type="button"
        variant="secondary"
        size="md"
        onClick={onClear}
        disabled={!hasFilters}
        className="shrink-0"
      >
        <X className="w-4 h-4" />
        Temizle
      </Button>
    </div>
  );
}
