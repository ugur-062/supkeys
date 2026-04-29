"use client";

import { EmailStatusBadge } from "@/components/ui/email-status-badge";
import { useEmailLogDetail } from "@/hooks/use-email-logs";
import { getTemplateLabel } from "@/lib/email-logs/status";
import { cn } from "@/lib/utils";
import * as Dialog from "@radix-ui/react-dialog";
import { format, formatDistanceToNow } from "date-fns";
import { tr } from "date-fns/locale";
import { Loader2, X } from "lucide-react";

interface DetailDrawerProps {
  id: string | null;
  onClose: () => void;
}

function formatFull(date: string | null) {
  if (!date) return "—";
  try {
    return format(new Date(date), "dd MMMM yyyy HH:mm:ss", { locale: tr });
  } catch {
    return "—";
  }
}

function formatRelative(date: string | null) {
  if (!date) return "—";
  try {
    return formatDistanceToNow(new Date(date), {
      addSuffix: true,
      locale: tr,
    });
  } catch {
    return "—";
  }
}

export function DetailDrawer({ id, onClose }: DetailDrawerProps) {
  const open = !!id;
  const detail = useEmailLogDetail(id);
  const item = detail.data;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-900/50 z-40" />
        <Dialog.Content
          className={cn(
            "fixed right-0 top-0 bottom-0 w-full sm:w-[480px] bg-admin-bg z-50 shadow-xl",
            "flex flex-col outline-none",
          )}
        >
          <header className="px-5 py-4 border-b border-admin-border bg-admin-surface flex items-center justify-between">
            <Dialog.Title className="font-display font-bold text-lg text-admin-text">
              E-posta Detayı
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                aria-label="Kapat"
                className="p-1.5 rounded-lg hover:bg-surface-muted text-admin-text-muted hover:text-admin-text transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </header>

          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
            {detail.isLoading && !item && (
              <div className="flex items-center justify-center py-16 text-admin-text-muted">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Yükleniyor…
              </div>
            )}

            {detail.isError && (
              <div className="p-4 rounded-lg bg-danger-50 border border-danger-500/30 text-danger-700 text-sm">
                Log yüklenemedi.
              </div>
            )}

            {item && (
              <>
                <section className="admin-card p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="font-display font-bold text-base text-admin-text truncate">
                        {item.subject}
                      </h2>
                      <p className="text-xs text-admin-text-muted mt-0.5">
                        {getTemplateLabel(item.template)}
                      </p>
                    </div>
                    <EmailStatusBadge status={item.status} />
                  </div>

                  <dl className="space-y-1.5 text-sm pt-1">
                    <div className="flex justify-between gap-4">
                      <dt className="text-admin-text-muted">Alıcı</dt>
                      <dd className="text-admin-text text-right">
                        {item.toName ? (
                          <>
                            <div>{item.toName}</div>
                            <div className="text-xs text-admin-text-muted">
                              {item.toEmail}
                            </div>
                          </>
                        ) : (
                          item.toEmail
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-admin-text-muted">Provider</dt>
                      <dd className="text-admin-text font-mono text-xs">
                        {item.provider}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-admin-text-muted">Mesaj ID</dt>
                      <dd className="text-admin-text font-mono text-[11px] break-all text-right">
                        {item.providerMessageId ?? "—"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-admin-text-muted">Deneme sayısı</dt>
                      <dd className="text-admin-text">{item.attemptCount}</dd>
                    </div>
                    {item.contextType && (
                      <div className="flex justify-between gap-4">
                        <dt className="text-admin-text-muted">Bağlam</dt>
                        <dd className="text-admin-text font-mono text-xs">
                          {item.contextType}:{item.contextId}
                        </dd>
                      </div>
                    )}
                  </dl>
                </section>

                {item.errorMessage && (
                  <section className="admin-card p-4 space-y-2 border-danger-500/30">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-danger-600">
                      Hata
                    </h3>
                    <pre className="text-xs text-danger-700 whitespace-pre-wrap break-words bg-danger-50 p-3 rounded-md font-mono">
                      {item.errorMessage}
                    </pre>
                  </section>
                )}

                <section className="admin-card p-4 space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-admin-text-muted">
                    Payload
                  </h3>
                  <pre className="text-xs text-admin-text whitespace-pre-wrap break-words bg-surface-muted p-3 rounded-md font-mono max-h-[300px] overflow-auto">
                    {JSON.stringify(item.payload, null, 2)}
                  </pre>
                </section>

                <section className="text-xs text-admin-text-muted space-y-1 px-1">
                  <div>
                    <span className="text-admin-text">Kuyruğa girdi:</span>{" "}
                    {formatFull(item.queuedAt)} ({formatRelative(item.queuedAt)})
                  </div>
                  {item.sentAt && (
                    <div>
                      <span className="text-admin-text">Gönderildi:</span>{" "}
                      {formatFull(item.sentAt)}
                    </div>
                  )}
                  {item.failedAt && (
                    <div>
                      <span className="text-admin-text">Başarısız:</span>{" "}
                      {formatFull(item.failedAt)}
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
