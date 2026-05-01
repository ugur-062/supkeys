"use client";

import { cn } from "@/lib/utils";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { CheckCircle2, Send, XCircle } from "lucide-react";

export type TedarikciTab = "approved" | "invitations" | "blocked";

interface TabsRootProps {
  value: TedarikciTab;
  onChange: (value: TedarikciTab) => void;
  approvedCount: number | null;
  invitationsCount: number | null;
  blockedCount: number | null;
  children: React.ReactNode;
}

function CountBadge({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <span className="ml-2 px-2 py-0.5 rounded-full text-[11px] bg-slate-100 text-slate-400">
        —
      </span>
    );
  }
  return (
    <span className="ml-2 px-2 py-0.5 rounded-full text-[11px] bg-slate-100 text-slate-600 group-data-[state=active]:bg-brand-100 group-data-[state=active]:text-brand-700">
      {value}
    </span>
  );
}

const TRIGGER_CLASSES = cn(
  "group inline-flex items-center px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
  "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50",
  "data-[state=active]:border-brand-600 data-[state=active]:text-brand-700 data-[state=active]:bg-brand-50/30",
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 rounded-t-md",
);

export function TedarikcilerTabs({
  value,
  onChange,
  approvedCount,
  invitationsCount,
  blockedCount,
  children,
}: TabsRootProps) {
  return (
    <TabsPrimitive.Root
      value={value}
      onValueChange={(v) => onChange(v as TedarikciTab)}
      className="space-y-4"
    >
      <TabsPrimitive.List
        className="border-b border-surface-border flex gap-1 overflow-x-auto"
        aria-label="Tedarikçi yönetim sekmeleri"
      >
        <TabsPrimitive.Trigger value="approved" className={TRIGGER_CLASSES}>
          <CheckCircle2 className="h-4 w-4 mr-2" />
          Onaylı Tedarikçiler
          <CountBadge value={approvedCount} />
        </TabsPrimitive.Trigger>
        <TabsPrimitive.Trigger value="invitations" className={TRIGGER_CLASSES}>
          <Send className="h-4 w-4 mr-2" />
          Çağrılan Tedarikçiler
          <CountBadge value={invitationsCount} />
        </TabsPrimitive.Trigger>
        <TabsPrimitive.Trigger value="blocked" className={TRIGGER_CLASSES}>
          <XCircle className="h-4 w-4 mr-2" />
          Engellenenler
          <CountBadge value={blockedCount} />
        </TabsPrimitive.Trigger>
      </TabsPrimitive.List>

      {children}
    </TabsPrimitive.Root>
  );
}

export const TabsContent = TabsPrimitive.Content;
