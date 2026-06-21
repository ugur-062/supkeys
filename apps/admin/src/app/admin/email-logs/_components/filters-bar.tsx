"use client";

import { Select } from "@/components/catalyst/select";
import { SearchInput } from "@/components/list";
import { Button } from "@/components/ui/button";
import {
  EMAIL_STATUS_META,
  EMAIL_STATUS_ORDER,
  EMAIL_TEMPLATE_LABELS,
} from "@/lib/email-logs/status";
import type { EmailLogStatus } from "@/lib/email-logs/types";
import { X } from "lucide-react";

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
  const hasFilters = !!toEmail || !!status || !!template;

  return (
    <div className="admin-card p-3 flex flex-col md:flex-row md:items-center gap-3">
      <SearchInput
        value={toEmail}
        onChange={onToEmailChange}
        placeholder="Alıcı e-posta ara…"
        className="flex-1 min-w-0"
      />

      <Select
        value={status}
        onChange={(e) => onStatusChange(e.target.value as EmailLogStatus | "")}
        aria-label="Durum filtresi"
        className="md:w-44"
      >
        <option value="">Tüm durumlar</option>
        {EMAIL_STATUS_ORDER.map((s) => (
          <option key={s} value={s}>
            {EMAIL_STATUS_META[s].label}
          </option>
        ))}
      </Select>

      <Select
        value={template}
        onChange={(e) => onTemplateChange(e.target.value)}
        aria-label="Şablon filtresi"
        className="md:w-56"
      >
        <option value="">Tüm şablonlar</option>
        {Object.entries(EMAIL_TEMPLATE_LABELS).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </Select>

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
