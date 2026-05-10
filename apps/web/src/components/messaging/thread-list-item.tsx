"use client";

import { AvatarInitials } from "@/components/ui/avatar-initials";
import type { AllThreadSummary } from "@/lib/messages/types";
import { cn } from "@/lib/utils";
import { format, isToday, isYesterday } from "date-fns";
import { tr } from "date-fns/locale";
import { ContextBadge } from "./context-badge";

interface Props {
  thread: AllThreadSummary;
  onClick: () => void;
  isActive?: boolean;
}

function formatTime(date: string): string {
  const d = new Date(date);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return "Dün";
  return format(d, "d MMM", { locale: tr });
}

/**
 * V2-4 — Thread listesinde tek satır:
 * Avatar + ad + bağlam rozeti + son mesaj preview + relative timestamp + unread dot.
 */
export function ThreadListItem({ thread, onClick, isActive }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left p-3 rounded-lg transition-colors border",
        isActive
          ? "bg-brand-50 border-brand-300"
          : "border-transparent hover:bg-slate-50 hover:border-slate-200",
      )}
    >
      <div className="flex items-start gap-3">
        <AvatarInitials name={thread.otherPartyName} size="md" />

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <p className="font-semibold text-sm text-brand-900 truncate">
              {thread.otherPartyName}
            </p>
            {thread.lastMessageAt ? (
              <span
                className={cn(
                  "text-[10px] flex-shrink-0",
                  thread.unread
                    ? "text-brand-700 font-semibold"
                    : "text-slate-400",
                )}
              >
                {formatTime(thread.lastMessageAt)}
              </span>
            ) : null}
          </div>

          <div className="mb-1">
            <ContextBadge
              context={thread.context}
              number={thread.contextNumber}
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <p
              className={cn(
                "text-xs truncate",
                thread.unread
                  ? "text-slate-900 font-medium"
                  : "text-slate-500",
              )}
            >
              {thread.lastMessagePreview ?? "Henüz mesaj yok"}
            </p>
            {thread.unread ? (
              <span
                className="bg-danger-500 h-2 w-2 rounded-full flex-shrink-0"
                aria-label="Okunmamış"
              />
            ) : null}
          </div>
        </div>
      </div>
    </button>
  );
}
