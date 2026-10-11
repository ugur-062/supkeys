"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EmailStatusBadge } from "@/components/ui/email-status-badge";
import { useEmailLogDetail, useResendEmail } from "@/hooks/use-email-logs";
import {
  EMAIL_EVENT_META,
  emailResendBlock,
  getContextLabel,
  getTemplateLabel,
} from "@/lib/email-logs/status";
import type { EmailEvent } from "@/lib/email-logs/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import { safeFormat, safeFormatDistance } from "@/lib/date";
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  Mail,
  MailOpen,
  MousePointerClick,
  X,
  type LucideIcon,
} from "lucide-react";
import { toastApiError } from "@/lib/api";

interface DetailDrawerProps {
  id: string | null;
  onClose: () => void;
}

function formatFull(date: string | null) {
  return safeFormat(date, "dd MMMM yyyy HH:mm:ss");
}

function formatRelative(date: string | null) {
  return safeFormatDistance(date, { addSuffix: true });
}

export function DetailDrawer({ id, onClose }: DetailDrawerProps) {
  // Yeniden gönderim gerçek dış etki — iki adımlı onay. Onay açıldığı KAYDA
  // bağlı tutulur (derin denetim LU-11): çekmece hep mount olduğundan düz bir
  // boolean A'da açılan "emin misiniz?" satırını B'ye taşırdı → B tek tıkla
  // gönderilirdi. Kapatınca da sıfırlanır.
  const [confirmFor, setConfirmFor] = useState<string | null>(null);
  const confirmResend = !!id && confirmFor === id;
  const setConfirmResend = (v: boolean) => setConfirmFor(v ? id : null);
  const handleClose = () => {
    setConfirmFor(null);
    onClose();
  };
  const open = !!id;
  const detail = useEmailLogDetail(id);
  const item = detail.data;
  const resend = useResendEmail();
  // İç kayıt (engel kaldırma işareti) ve gizli içerikli kayıt yeniden
  // gönderilemez — API 400 verir; düğme hiç çizilmez (arayüz testi O-078).
  const resendBlock = item ? emailResendBlock(item) : null;

  const onResend = () => {
    if (!id) return;
    resend.mutate(id, {
      // `sent: false`: alıcı bu türden çıkmış ya da adres bastırılmış — yeni
      // kayıt FAILED + nedeniyle yazıldı; başarı gibi gösterme.
      onSuccess: (res) =>
        res?.sent === false
          ? toast.warning(
              "Gönderilmedi — alıcı bu e-posta türünden çıkmış ya da adres bastırılmış. Ayrıntı yeni kayıtta.",
            )
          : toast.success("E-posta yeniden gönderildi"),
      onError: (e: unknown) => toastApiError(e, "Gönderilemedi"),
    });
  };

  return (
    <Dialog open={open} onClose={handleClose} className="relative z-50">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-zinc-950/30 backdrop-blur-sm transition-opacity duration-300 data-closed:opacity-0"
      />
      <div className="fixed inset-0 overflow-hidden">
        <div className="absolute inset-y-0 right-0 flex max-w-full">
          <DialogPanel
            transition
            className="flex w-screen sm:w-[480px] flex-col bg-admin-bg shadow-xl outline-none transition duration-300 ease-in-out data-closed:translate-x-full"
          >
            <header className="px-5 py-4 border-b border-admin-border bg-admin-surface flex items-center justify-between">
              <DialogTitle className="font-display font-bold text-lg text-admin-text">
                E-posta Detayı
              </DialogTitle>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Kapat"
                className="p-1.5 rounded-lg hover:bg-surface-muted text-admin-text-muted hover:text-admin-text transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
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
                      {/* İç kaydın konusu API'nin makine metnidir ("suppression
                          clear (admin)") — başlıkta şablon etiketi gösterilir
                          (arayüz testi webC-15 yeniden doğrulama). */}
                      <h2 className="font-display font-bold text-base text-admin-text truncate">
                        {resendBlock === "internal"
                          ? getTemplateLabel(item.template)
                          : item.subject}
                      </h2>
                      {resendBlock !== "internal" ? (
                        <p className="text-xs text-admin-text-muted mt-0.5">
                          {getTemplateLabel(item.template)}
                        </p>
                      ) : null}
                    </div>
                    <EmailStatusBadge status={item.status} />
                  </div>
                  {resendBlock === "internal" ? (
                    <p className="text-admin-text-muted text-xs">
                      Sistemin iç kaydı — gerçek bir e-posta değildir, yeniden
                      gönderilemez.
                    </p>
                  ) : resendBlock === "redacted" ? (
                    <p className="text-admin-text-muted text-xs">
                      Tek kullanımlık kod ya da davet bağlantısı taşıdığı için
                      içeriği saklanmaz ve yeniden gönderilemez. Kullanıcı kodu
                      veya daveti yeniden talep etmeli.
                    </p>
                  ) : confirmResend ? (
                    <div className="flex items-center gap-2">
                      <span className="text-admin-text-muted text-xs">
                        E-posta yeniden gönderilecek — emin misiniz?
                      </span>
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        onClick={() => {
                          onResend();
                          setConfirmResend(false);
                        }}
                        disabled={resend.isPending}
                      >
                        Evet, Gönder
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmResend(false)}
                      >
                        Vazgeç
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setConfirmResend(true)}
                      disabled={resend.isPending}
                    >
                      {resend.isPending ? "Gönderiliyor..." : "Yeniden Gönder"}
                    </Button>
                  )}

                  <dl className="space-y-1.5 text-sm pt-1">
                    <div className="flex justify-between gap-4">
                      <dt className="text-admin-text-muted">Alıcı</dt>
                      <dd className="text-admin-text min-w-0 text-right break-words">
                        {item.toName ? (
                          <>
                            <div>{item.toName}</div>
                            <div className="text-xs text-admin-text-muted break-all">
                              {item.toEmail}
                            </div>
                          </>
                        ) : (
                          item.toEmail
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-admin-text-muted">Sağlayıcı</dt>
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
                      // Okunur bağlam + kimlik ayrı satırda, mobilde sarar
                      // (arayüz testi D-144 / D-229).
                      <div className="flex justify-between gap-4">
                        <dt className="text-admin-text-muted shrink-0">Bağlam</dt>
                        <dd className="text-admin-text min-w-0 text-right">
                          <div>{getContextLabel(item.contextType)}</div>
                          {item.contextId ? (
                            <div className="text-admin-text-muted font-mono text-[11px] break-all">
                              {item.contextId}
                            </div>
                          ) : null}
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

                {(item.bouncedAt || item.bounceReason) && (
                  <section className="admin-card p-4 space-y-2 border-danger-500/30">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-danger-600">
                      Bounce
                    </h3>
                    <p className="text-sm text-danger-800">
                      <strong>{item.bounceType?.toUpperCase() ?? "—"}</strong>
                      {" — "}
                      {item.bounceReason ?? "Sebep belirtilmemiş"}
                    </p>
                  </section>
                )}

                {item.events && item.events.length > 0 ? (
                  <EventTimelineSection events={item.events} />
                ) : (
                  <section className="admin-card p-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-admin-text-muted mb-2">
                      Teslimat Geçmişi
                    </h3>
                    <p className="text-xs text-admin-text-muted">
                      Henüz teslimat olayı yok.
                    </p>
                  </section>
                )}

                {resendBlock !== "internal" ? (
                  <EmailPreviewSection
                    payload={item.payload}
                    redacted={resendBlock === "redacted"}
                  />
                ) : null}

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
                  {item.deliveredAt && (
                    <div>
                      <span className="text-admin-text">Teslim edildi:</span>{" "}
                      {formatFull(item.deliveredAt)}
                    </div>
                  )}
                  {item.openedAt && (
                    <div>
                      <span className="text-admin-text">İlk açılma:</span>{" "}
                      {formatFull(item.openedAt)}
                    </div>
                  )}
                  {item.clickedAt && (
                    <div>
                      <span className="text-admin-text">İlk tıklama:</span>{" "}
                      {formatFull(item.clickedAt)}
                    </div>
                  )}
                  {item.bouncedAt && (
                    <div>
                      <span className="text-admin-text">Bounce:</span>{" "}
                      {formatFull(item.bouncedAt)}
                    </div>
                  )}
                  {item.complainedAt && (
                    <div>
                      <span className="text-admin-text">Şikayet:</span>{" "}
                      {formatFull(item.complainedAt)}
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
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
}

type PreviewInfoRow = { label: string; value: string };

function asText(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

/**
 * Okunur önizleme (arayüz testi D-144): bildirim şablonunda başlık,
 * paragraflar, bilgi satırları ve düğme; diğer şablonlarda düz metin alanlar.
 * Ham JSON yalnız katlanır "Ham veri" bölümünde.
 */
function EmailPreviewSection({
  payload,
  redacted,
}: {
  payload: unknown;
  redacted: boolean;
}) {
  const data =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : null;
  const heading = asText(data?.heading);
  const paragraphs = Array.isArray(data?.paragraphs)
    ? (data.paragraphs as unknown[]).flatMap((p) => asText(p) ?? [])
    : [];
  const infoRows = Array.isArray(data?.infoRows)
    ? (data.infoRows as unknown[]).flatMap((r) => {
        const row = r as Partial<PreviewInfoRow> | null;
        const label = asText(row?.label);
        const value = asText(row?.value);
        return label && value ? [{ label, value }] : [];
      })
    : [];
  const ctaLabel = asText(data?.ctaLabel);
  const ctaUrl = asText(data?.ctaUrl);
  const footerNote = asText(data?.footerNote);
  const isNotification = !!heading || paragraphs.length > 0;
  // Diğer şablonlar: yalnız düz metin/sayı alanları (iç içe yapılar ham
  // veride kalır).
  const plainFields = isNotification
    ? []
    : Object.entries(data ?? {}).flatMap(([k, v]) =>
        typeof v === "string" || typeof v === "number"
          ? [{ label: k, value: String(v) }]
          : [],
      );

  return (
    <section className="admin-card p-4 space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-admin-text-muted">
        Önizleme
      </h3>
      {redacted ? (
        <p className="text-xs text-admin-text-muted">
          İçerik güvenlik gereği saklanmaz (tek kullanımlık kod/bağlantı).
        </p>
      ) : isNotification ? (
        <div className="space-y-2 rounded-md border border-admin-border bg-admin-surface p-3 text-sm text-admin-text break-words">
          {heading ? <p className="font-semibold">{heading}</p> : null}
          {paragraphs.map((p, i) => (
            <p key={i} className="whitespace-pre-line">
              {p}
            </p>
          ))}
          {infoRows.length > 0 ? (
            <dl className="space-y-1 text-xs">
              {infoRows.map((r, i) => (
                <div key={i} className="flex justify-between gap-3">
                  <dt className="text-admin-text-muted shrink-0">{r.label}</dt>
                  <dd className="min-w-0 text-right break-words">{r.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {ctaLabel ? (
            <p className="text-xs">
              <span className="inline-block rounded-md bg-zinc-900 px-2.5 py-1 font-medium text-white">
                {ctaLabel}
              </span>
              {ctaUrl ? (
                <span className="text-admin-text-muted mt-1 block break-all">
                  {ctaUrl}
                </span>
              ) : null}
            </p>
          ) : null}
          {footerNote ? (
            <p className="text-admin-text-muted text-xs">{footerNote}</p>
          ) : null}
        </div>
      ) : plainFields.length > 0 ? (
        <dl className="space-y-1 text-xs">
          {plainFields.map((f) => (
            <div key={f.label} className="flex justify-between gap-3">
              <dt className="text-admin-text-muted shrink-0 font-mono">{f.label}</dt>
              <dd className="text-admin-text min-w-0 text-right break-all">{f.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-xs text-admin-text-muted">Önizlenecek içerik yok.</p>
      )}
      {!redacted && data && Object.keys(data).length > 0 ? (
        <details className="text-xs">
          <summary className="cursor-pointer text-admin-text-muted">
            Ham veri (JSON)
          </summary>
          <pre className="mt-2 text-admin-text whitespace-pre-wrap break-words bg-surface-muted p-3 rounded-md font-mono max-h-[300px] overflow-auto">
            {JSON.stringify(data, null, 2)}
          </pre>
        </details>
      ) : null}
    </section>
  );
}

/**
 * V2-1 — Resend webhook event timeline. Her event ayrı satır; ilk SENT'ten
 * son CLICKED/BOUNCED'a kadar zaman çizelgesi.
 */
function EventTimelineSection({ events }: { events: EmailEvent[] }) {
  return (
    <section className="admin-card p-4 space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-admin-text-muted">
        Teslimat Geçmişi ({events.length})
      </h3>
      <ol className="space-y-3">
        {events.map((ev) => {
          const meta = EMAIL_EVENT_META[ev.eventType] ?? {
            label: ev.eventType,
            iconColor: "text-slate-500",
            iconBg: "bg-slate-50",
            iconBorder: "border-slate-200",
          };
          const Icon = pickEventIcon(ev.eventType);
          return (
            <li key={ev.id} className="flex gap-3">
              <div
                className={cn(
                  "h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 border",
                  meta.iconBg,
                  meta.iconBorder,
                )}
              >
                <Icon className={cn("h-4 w-4", meta.iconColor)} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-admin-text text-sm">
                    {meta.label}
                  </p>
                  <span className="text-[11px] text-admin-text-muted whitespace-nowrap">
                    {safeFormat(ev.occurredAt, "d MMM HH:mm:ss")}
                  </span>
                </div>
                {ev.clickedUrl ? (
                  <p className="text-xs text-admin-text-muted mt-1 truncate">
                    → {ev.clickedUrl}
                  </p>
                ) : null}
                {ev.bounceReason ? (
                  <p className="text-xs text-danger-600 mt-1">
                    {ev.bounceType ? `${ev.bounceType}: ` : ""}
                    {ev.bounceReason}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

const EVENT_ICON_MAP: Record<string, LucideIcon> = {
  SENT: Mail,
  DELIVERED: CheckCircle2,
  DELIVERY_DELAYED: Clock,
  OPENED: MailOpen,
  CLICKED: MousePointerClick,
  BOUNCED: AlertOctagon,
  COMPLAINED: AlertOctagon,
  FAILED: AlertTriangle,
};

function pickEventIcon(type: string): LucideIcon {
  return EVENT_ICON_MAP[type] ?? Mail;
}
