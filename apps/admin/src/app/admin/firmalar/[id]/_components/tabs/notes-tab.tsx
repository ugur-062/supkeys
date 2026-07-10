"use client";

import { Button } from "@/components/ui/button";
import {
  useAddNote,
  useCompanyNotes,
  useDeleteNote,
} from "@/hooks/use-admin-support";
import { safeFormat } from "@/lib/date";
import { StickyNote, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/** Dahili notlar — "aradı, X sözü verildi" kayıtları. Müşteri ASLA görmez. */
export function NotesTab({ companyId }: { companyId: string }) {
  const notes = useCompanyNotes(companyId);
  const add = useAddNote(companyId);
  const del = useDeleteNote(companyId);
  const [body, setBody] = useState("");

  const err = (e: unknown) =>
    toast.error(e instanceof Error ? e.message : "Hata");

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
        Bu notlar yalnız yönetim panelinde görünür — müşteriyle paylaşılmaz.
      </div>

      <section className="admin-card px-5 py-4">
        <label className="flex flex-col gap-2">
          <span className="text-admin-text text-sm font-semibold">
            Yeni not
          </span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder="Örn. 10 Tem — telefonla aradı, KYC belgesini yarın yükleyecek; premium teklifi iletildi."
            className="border-admin-border bg-admin-surface text-admin-text rounded-lg border px-3 py-2 text-sm"
          />
        </label>
        <div className="mt-2 flex justify-end">
          <Button
            size="sm"
            loading={add.isPending}
            disabled={body.trim().length < 3}
            onClick={() =>
              add.mutate(
                { body: body.trim() },
                {
                  onSuccess: () => {
                    toast.success("Not eklendi");
                    setBody("");
                  },
                  onError: err,
                },
              )
            }
          >
            Not Ekle
          </Button>
        </div>
      </section>

      <section className="space-y-2">
        {(notes.data ?? []).length === 0 ? (
          <div className="admin-card text-admin-text-muted flex flex-col items-center gap-2 px-6 py-12 text-center text-sm">
            <StickyNote className="h-6 w-6" aria-hidden="true" />
            {notes.isLoading ? "Yükleniyor..." : "Henüz not yok"}
          </div>
        ) : (
          (notes.data ?? []).map((n) => (
            <div key={n.id} className="admin-card px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-admin-text text-sm whitespace-pre-wrap">
                  {n.body}
                </p>
                <button
                  type="button"
                  title="Notu sil"
                  aria-label="Notu sil"
                  disabled={del.isPending}
                  onClick={() =>
                    del.mutate(
                      { noteId: n.id },
                      {
                        onSuccess: () => toast.success("Not silindi"),
                        onError: err,
                      },
                    )
                  }
                  className="text-admin-text-muted shrink-0 rounded p-1 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="text-admin-text-muted mt-1.5 text-xs">
                {n.adminEmail ?? "—"} ·{" "}
                {safeFormat(n.createdAt, "d MMM yyyy HH:mm")}
              </p>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
