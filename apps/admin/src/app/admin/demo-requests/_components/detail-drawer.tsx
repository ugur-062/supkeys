"use client";

import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import {
  useDemoRequestDetail,
  useUpdateDemoRequest,
} from "@/hooks/use-demo-requests";
import { DEMO_REQUEST_STATUS_META } from "@/lib/demo-requests/status";
import type { DemoRequestStatus } from "@/lib/demo-requests/types";
import { cn } from "@/lib/utils";
import * as Dialog from "@radix-ui/react-dialog";
import axios from "axios";
import { format, formatDistanceToNow } from "date-fns";
import { tr } from "date-fns/locale";
import {
  CheckCircle2,
  Loader2,
  Mail,
  Phone,
  RotateCcw,
  Send,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { RejectDemoModal } from "./reject-demo-modal";
import { SendInviteModal } from "./send-invite-modal";

interface DetailDrawerProps {
  id: string | null;
  onClose: () => void;
}

function formatFull(date: string | null) {
  if (!date) return "—";
  try {
    return format(new Date(date), "dd MMMM yyyy HH:mm", { locale: tr });
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

function getErrorMessage(err: unknown, fallback: string) {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string | string[] } | undefined;
    if (Array.isArray(data?.message)) return data.message.join(", ");
    return data?.message ?? fallback;
  }
  return fallback;
}

/** Kapanış sebebi enum/freetext'ini insan diline çevir */
function formatClosedReason(raw: string | null): string | null {
  if (!raw) return null;
  if (raw === "NOT_INTERESTED") return "Demo gerçekleşti, ilgilenmediler";
  return raw;
}

const LEGACY_STATUSES: DemoRequestStatus[] = ["CONTACTED", "DEMO_SCHEDULED"];
const CLOSED_DISPLAY_STATUSES: DemoRequestStatus[] = ["WON", "LOST", "SPAM"];

export function DetailDrawer({ id, onClose }: DetailDrawerProps) {
  const open = !!id;
  const detail = useDemoRequestDetail(id);
  const update = useUpdateDemoRequest(id ?? "");

  const [notesDraft, setNotesDraft] = useState("");
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);

  // Detay yüklenince notları senkronla
  useEffect(() => {
    if (detail.data) {
      setNotesDraft(detail.data.notes ?? "");
    }
  }, [detail.data]);

  const item = detail.data;
  const notesDirty = item !== undefined && notesDraft !== (item.notes ?? "");

  const closedReasonLabel = useMemo(
    () => (item ? formatClosedReason(item.closedReason ?? null) : null),
    [item],
  );

  const handleMarkAsDone = () => {
    if (!item) return;
    update.mutate(
      { status: "DEMO_DONE" as DemoRequestStatus },
      {
        onSuccess: () => toast.success("Demo yapıldı olarak işaretlendi"),
        onError: (err) =>
          toast.error(getErrorMessage(err, "Statü güncellenemedi")),
      },
    );
  };

  const handleMarkAsWon = () => {
    if (!item) return;
    update.mutate(
      { status: "WON" as DemoRequestStatus },
      {
        onSuccess: () => toast.success("Talep kazanıldı olarak işaretlendi"),
        onError: (err) =>
          toast.error(getErrorMessage(err, "Statü güncellenemedi")),
      },
    );
  };

  const handleNotesSave = () => {
    if (!item) return;
    update.mutate(
      { notes: notesDraft },
      {
        onSuccess: () => toast.success("Notlar kaydedildi"),
        onError: (err) =>
          toast.error(getErrorMessage(err, "Notlar kaydedilemedi")),
      },
    );
  };

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
            "fixed right-0 top-0 bottom-0 w-full sm:w-[420px] bg-admin-bg z-50 shadow-xl",
            "flex flex-col outline-none",
          )}
        >
          <header className="px-5 py-4 border-b border-admin-border bg-admin-surface flex items-center justify-between">
            <Dialog.Title className="font-display font-bold text-lg text-admin-text">
              Talep Detayı
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
            {detail.isLoading && (
              <div className="flex items-center justify-center py-16 text-admin-text-muted">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Yükleniyor…
              </div>
            )}

            {detail.isError && (
              <div className="p-4 rounded-lg bg-danger-50 border border-danger-500/30 text-danger-700 text-sm">
                Talep yüklenemedi.
              </div>
            )}

            {item && (
              <>
                <section className="admin-card p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="font-display font-bold text-lg text-admin-text truncate">
                        {item.companyName}
                      </h2>
                      <p className="text-sm text-admin-text-muted">
                        {item.contactName}
                        {item.jobTitle ? ` • ${item.jobTitle}` : ""}
                      </p>
                    </div>
                    <StatusBadge status={item.status} />
                  </div>

                  <dl className="space-y-2 text-sm pt-1">
                    <div className="flex items-center gap-2 text-admin-text">
                      <Mail className="w-4 h-4 text-admin-text-muted shrink-0" />
                      <a
                        href={`mailto:${item.email}`}
                        className="hover:text-brand-700 hover:underline truncate"
                      >
                        {item.email}
                      </a>
                    </div>
                    {item.phone && (
                      <div className="flex items-center gap-2 text-admin-text">
                        <Phone className="w-4 h-4 text-admin-text-muted shrink-0" />
                        <a
                          href={`tel:${item.phone}`}
                          className="hover:text-brand-700 hover:underline"
                        >
                          {item.phone}
                        </a>
                      </div>
                    )}
                    {item.companySize && (
                      <div className="flex justify-between">
                        <dt className="text-admin-text-muted">Firma boyutu</dt>
                        <dd className="text-admin-text">{item.companySize}</dd>
                      </div>
                    )}
                    {item.source && (
                      <div className="flex justify-between">
                        <dt className="text-admin-text-muted">Kaynak</dt>
                        <dd className="text-admin-text font-mono text-xs">
                          {item.source}
                        </dd>
                      </div>
                    )}
                  </dl>
                </section>

                {item.message && (
                  <section className="admin-card p-4 space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-admin-text-muted">
                      Mesaj
                    </h3>
                    <p className="text-sm text-admin-text whitespace-pre-wrap">
                      {item.message}
                    </p>
                  </section>
                )}

                {/* ---- AKSİYON BÖLÜMÜ — statüye göre buton şablonu ---- */}
                <section className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-admin-text-muted">
                    Aksiyonlar
                  </h3>

                  {item.status === "NEW" && (
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        onClick={handleMarkAsDone}
                        loading={update.isPending}
                        disabled={update.isPending}
                        className="flex-1"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Demo Yapıldı
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setRejectModalOpen(true)}
                        disabled={update.isPending}
                        className="flex-1 !text-danger-600 !border-danger-200 hover:!bg-danger-50"
                      >
                        <XCircle className="w-4 h-4" />
                        Reddet
                      </Button>
                    </div>
                  )}

                  {item.status === "DEMO_DONE" && !item.linkedApplicationId && (
                    <div className="space-y-3">
                      {/* Davet butonu: hiç gönderilmemişse primary */}
                      {!item.inviteSentAt ? (
                        <Button
                          type="button"
                          onClick={() => setInviteModalOpen(true)}
                          fullWidth
                        >
                          <Send className="w-4 h-4" />
                          Davet Linki Gönder
                        </Button>
                      ) : (
                        <div className="space-y-2.5">
                          <div className="rounded-xl border border-brand-100 bg-brand-50 p-4">
                            <div className="flex items-start gap-3">
                              <Mail className="w-5 h-5 text-brand-600 shrink-0 mt-0.5" />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-brand-700">
                                  Davet gönderildi
                                </p>
                                <p className="text-sm text-admin-text mt-1 truncate">
                                  {item.inviteSentToEmail}
                                </p>
                                <p className="text-xs text-admin-text-muted mt-1">
                                  {formatRelative(item.inviteSentAt)}
                                  {item.inviteSentCount > 1 &&
                                    ` · ${item.inviteSentCount} kez gönderildi`}
                                </p>
                                {item.inviteTokenExpAt &&
                                  new Date(item.inviteTokenExpAt) >
                                    new Date() && (
                                    <p className="text-xs text-admin-text-muted mt-0.5">
                                      Son geçerlilik:{" "}
                                      {format(
                                        new Date(item.inviteTokenExpAt),
                                        "d MMM yyyy",
                                        { locale: tr },
                                      )}
                                    </p>
                                  )}
                              </div>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => setInviteModalOpen(true)}
                            fullWidth
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Yeniden Gönder
                          </Button>
                        </div>
                      )}

                      {/* Reddet butonu (her zaman alt sırada) */}
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setRejectModalOpen(true)}
                        disabled={update.isPending}
                        fullWidth
                        className="!text-danger-600 !border-danger-200 hover:!bg-danger-50"
                      >
                        <XCircle className="w-4 h-4" />
                        Reddet
                      </Button>
                    </div>
                  )}

                  {/* DEMO_DONE + kayıt tamamlandı — invite gizli, "Kazanıldı'ya çevir" CTA */}
                  {item.status === "DEMO_DONE" && item.linkedApplicationId && (
                    <div className="space-y-3">
                      <div className="rounded-xl border border-success-500/30 bg-success-50 p-4">
                        <div className="flex items-start gap-3">
                          <CheckCircle2 className="w-5 h-5 text-success-600 shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-success-700">
                              Kayıt tamamlandı
                            </p>
                            <p className="text-xs text-success-600/80 mt-1">
                              Müşteri kayıt formunu doldurdu, başvuru admin
                              onayını bekliyor.
                            </p>
                          </div>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={handleMarkAsWon}
                        loading={update.isPending}
                        disabled={update.isPending}
                        fullWidth
                      >
                        Kazanıldı olarak işaretle
                      </Button>
                    </div>
                  )}

                  {CLOSED_DISPLAY_STATUSES.includes(item.status) && (
                    <div className="rounded-xl border border-admin-border bg-surface-muted p-4 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={item.status} />
                        <span className="text-sm font-semibold text-admin-text">
                          {DEMO_REQUEST_STATUS_META[item.status].label}
                        </span>
                      </div>
                      {closedReasonLabel && (
                        <p className="text-xs text-admin-text-muted">
                          Sebep:{" "}
                          <span className="text-admin-text">
                            {closedReasonLabel}
                          </span>
                        </p>
                      )}
                      {item.linkedApplicationId && item.status === "WON" && (
                        <p className="text-xs text-success-600">
                          ✓ Kayıt tamamlandı
                        </p>
                      )}
                      {item.closedAt && (
                        <p className="text-xs text-admin-text-muted">
                          Kapanış: {formatFull(item.closedAt)}
                        </p>
                      )}
                    </div>
                  )}

                  {LEGACY_STATUSES.includes(item.status) && (
                    <div className="space-y-3">
                      <div className="rounded-xl border border-warning-500/30 bg-warning-50 p-4 text-sm text-warning-700">
                        <p className="font-medium">
                          Bu kayıt eski akıştan kalmış
                        </p>
                        <p className="text-xs mt-1 text-warning-600/90">
                          Yeni akışta sadece &ldquo;Demo Yapıldı&rdquo; ve
                          &ldquo;Reddet&rdquo; aksiyonları kullanılır.
                        </p>
                      </div>
                      <Button
                        type="button"
                        onClick={handleMarkAsDone}
                        loading={update.isPending}
                        disabled={update.isPending}
                        fullWidth
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Demo Yapıldı (DEMO_DONE&apos;a geç)
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setRejectModalOpen(true)}
                        disabled={update.isPending}
                        fullWidth
                        className="!text-danger-600 !border-danger-200 hover:!bg-danger-50"
                      >
                        <XCircle className="w-4 h-4" />
                        Reddet
                      </Button>
                    </div>
                  )}
                </section>

                <section className="admin-card p-4 space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-admin-text-muted">
                    Notlar
                  </h3>
                  <Textarea
                    value={notesDraft}
                    onChange={(e) => setNotesDraft(e.target.value)}
                    placeholder="İç ekibe görünen admin notları…"
                    className="min-h-[120px]"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleNotesSave}
                    loading={update.isPending}
                    disabled={!notesDirty || update.isPending}
                    fullWidth
                  >
                    Notları Kaydet
                  </Button>
                </section>

                <section className="text-xs text-admin-text-muted space-y-1 px-1">
                  <div>
                    <span className="text-admin-text">Oluşturulma:</span>{" "}
                    {formatFull(item.createdAt)} ({formatRelative(item.createdAt)})
                  </div>
                  <div>
                    <span className="text-admin-text">Son güncelleme:</span>{" "}
                    {formatFull(item.updatedAt)}
                  </div>
                  {item.contactedAt && (
                    <div>
                      <span className="text-admin-text">İletişim:</span>{" "}
                      {formatFull(item.contactedAt)}
                    </div>
                  )}
                  {item.closedAt && (
                    <div>
                      <span className="text-admin-text">Kapanış:</span>{" "}
                      {formatFull(item.closedAt)}
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>

      {item && (
        <>
          <SendInviteModal
            demoId={item.id}
            defaultEmail={item.inviteSentToEmail ?? item.email}
            companyName={item.companyName}
            isResend={!!item.inviteSentAt}
            open={inviteModalOpen}
            onClose={() => setInviteModalOpen(false)}
          />
          <RejectDemoModal
            demoId={item.id}
            companyName={item.companyName}
            open={rejectModalOpen}
            onClose={() => setRejectModalOpen(false)}
          />
        </>
      )}
    </Dialog.Root>
  );
}
