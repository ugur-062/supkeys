"use client";

import { cn } from "@/lib/utils";
import { CheckCircle2, Handshake, Send, XCircle } from "lucide-react";
import { createContext, useContext } from "react";

export type TedarikciTab = "approved" | "requests" | "invitations" | "blocked";

const TabsContext = createContext<TedarikciTab>("approved");

interface TabsRootProps {
  value: TedarikciTab;
  onChange: (value: TedarikciTab) => void;
  approvedCount: number | null;
  requestsCount: number | null;
  invitationsCount: number | null;
  blockedCount: number | null;
  children: React.ReactNode;
}

function CountBadge({
  value,
  active,
}: {
  value: number | null;
  active: boolean;
}) {
  if (value === null) {
    return (
      <span className="ml-2 px-2 py-0.5 rounded-full text-[11px] bg-zinc-100 text-zinc-400">
        —
      </span>
    );
  }
  return (
    <span
      className={cn(
        "ml-2 px-2 py-0.5 rounded-full text-[11px]",
        active ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600",
      )}
    >
      {value}
    </span>
  );
}

function triggerClasses(active: boolean) {
  return cn(
    "group inline-flex items-center px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap focus:outline-none rounded-t-md",
    active
      ? "border-zinc-900 text-zinc-900"
      : "border-transparent text-zinc-500 hover:text-zinc-700",
  );
}

export function TedarikcilerTabs({
  value,
  onChange,
  approvedCount,
  requestsCount,
  invitationsCount,
  blockedCount,
  children,
}: TabsRootProps) {
  const tabs: Array<{
    key: TedarikciTab;
    icon: typeof CheckCircle2;
    label: string;
    count: number | null;
  }> = [
    {
      key: "approved",
      icon: CheckCircle2,
      label: "Onaylı Tedarikçiler",
      count: approvedCount,
    },
    {
      key: "requests",
      icon: Handshake,
      label: "Gelen İstekler",
      count: requestsCount,
    },
    {
      key: "invitations",
      icon: Send,
      label: "Çağrılan Tedarikçiler",
      count: invitationsCount,
    },
    {
      key: "blocked",
      icon: XCircle,
      label: "Engellenenler",
      count: blockedCount,
    },
  ];

  return (
    <TabsContext.Provider value={value}>
      <div className="space-y-4">
        <div
          role="tablist"
          aria-label="Tedarikçi yönetim sekmeleri"
          className="border-b border-zinc-950/5 flex gap-1 overflow-x-auto"
        >
          {tabs.map(({ key, icon: Icon, label, count }) => {
            const active = value === key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onChange(key)}
                className={triggerClasses(active)}
              >
                <Icon className="h-4 w-4 mr-2" />
                {label}
                <CountBadge value={count} active={active} />
              </button>
            );
          })}
        </div>

        {children}
      </div>
    </TabsContext.Provider>
  );
}

export function TabsContent({
  value,
  className,
  children,
}: {
  value: TedarikciTab;
  className?: string;
  children: React.ReactNode;
}) {
  const active = useContext(TabsContext);
  if (active !== value) return null;
  return <div className={className}>{children}</div>;
}
