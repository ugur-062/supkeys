"use client";

import { Hammer } from "lucide-react";

/** Sonraki fazda dolacak sekme — ne geleceğini açıkça söyler. */
export function PlaceholderTab({ label }: { label: string }) {
  return (
    <div className="admin-card flex flex-col items-center gap-3 px-6 py-16 text-center">
      <Hammer className="text-admin-text-muted h-8 w-8" aria-hidden="true" />
      <p className="text-admin-text text-sm font-medium">Bu bölüm yolda</p>
      <p className="text-admin-text-muted max-w-md text-sm">{label}</p>
    </div>
  );
}
