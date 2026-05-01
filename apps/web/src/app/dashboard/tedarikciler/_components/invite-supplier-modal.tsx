"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useBatchInvitations } from "@/hooks/use-supplier-invitations";
import {
  parseEmails,
  type ParsedEmail,
} from "@/lib/tedarikciler/parse-emails";
import type { BatchInvitationResponse } from "@/lib/tedarikciler/types";
import { cn } from "@/lib/utils";
import * as Dialog from "@radix-ui/react-dialog";
import axios from "axios";
import {
  AlertTriangle,
  ChevronDown,
  Eye,
  Info,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { EmailPreviewPanel } from "./email-preview-panel";

interface InviteSupplierModalProps {
  open: boolean;
  onClose: () => void;
  /** Modal açılırken e-posta input'u önceden doldurulsun (örn. yeniden davet akışı) */
  initialEmails?: string[];
}

const MAX_EMAILS = 50;
const MAX_MESSAGE = 500;

function getErrorMessage(err: unknown, fallback: string) {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string | string[] } | undefined;
    if (Array.isArray(data?.message)) return data.message.join(", ");
    return data?.message ?? fallback;
  }
  return fallback;
}

function reasonLabel(reason: string | undefined): string {
  if (reason === "ALREADY_INVITED") return "Zaten davet edilmiş";
  if (reason === "ALREADY_SUPPLIER") return "Zaten tedarikçiniz";
  return "Hata";
}

export function InviteSupplierModal({
  open,
  onClose,
  initialEmails,
}: InviteSupplierModalProps) {
  const [emailsRaw, setEmailsRaw] = useState("");
  const [contactName, setContactName] = useState("");
  const [message, setMessage] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [batchResult, setBatchResult] =
    useState<BatchInvitationResponse | null>(null);

  const batch = useBatchInvitations();

  // Modal açıldığında state sıfırla / initial doldur
  useEffect(() => {
    if (open) {
      setEmailsRaw(initialEmails?.join(", ") ?? "");
      setContactName("");
      setMessage("");
      setPreviewOpen(false);
      setBatchResult(null);
    }
  }, [open, initialEmails]);

  const parsed: ParsedEmail[] = useMemo(
    () => parseEmails(emailsRaw),
    [emailsRaw],
  );

  const validEmails = useMemo(
    () => parsed.filter((e) => e.valid).map((e) => e.email),
    [parsed],
  );
  const invalidCount = parsed.length - validEmails.length;
  const overLimit = validEmails.length > MAX_EMAILS;

  // Batch result varsa: hata almış e-postaları kırmızı pill'le göster
  const failedEmails = useMemo(() => {
    if (!batchResult) return new Map<string, string>();
    const m = new Map<string, string>();
    for (const r of batchResult.results) {
      if (!r.success) m.set(r.email, r.reason ?? "ERROR");
    }
    return m;
  }, [batchResult]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validEmails.length === 0) {
      toast.error("En az 1 geçerli e-posta gerekli");
      return;
    }
    if (overLimit) {
      toast.error(`Tek seferde en fazla ${MAX_EMAILS} e-posta gönderebilirsiniz`);
      return;
    }

    batch.mutate(
      {
        emails: validEmails,
        contactName: contactName.trim() || undefined,
        message: message.trim() || undefined,
      },
      {
        onSuccess: (data) => {
          setBatchResult(data);
          if (data.summary.failed === 0) {
            toast.success(`${data.summary.success} davet gönderildi`);
            onClose();
          } else if (data.summary.success === 0) {
            toast.error(
              `Hiçbir davet gönderilemedi (${data.summary.failed} hata)`,
            );
          } else {
            toast.success(
              `${data.summary.success} başarılı, ${data.summary.failed} hata — modal açık kalıyor`,
            );
            // Hatalı olmayan başarılı e-postaları input'tan çıkar — kalan hataları
            // kullanıcı düzeltebilsin
            const remaining = parsed
              .filter((p) => failedEmailsContains(data, p.email) || !p.valid)
              .map((p) => p.email);
            setEmailsRaw(remaining.join(", "));
          }
        },
        onError: (err) =>
          toast.error(getErrorMessage(err, "Davet gönderilemedi")),
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
        <Dialog.Overlay className="fixed inset-0 bg-slate-900/60 z-[60]" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[60]",
            "w-[calc(100vw-2rem)] max-w-lg max-h-[90vh] overflow-y-auto",
            "bg-white rounded-2xl shadow-2xl outline-none",
          )}
        >
          <header className="px-5 py-4 border-b border-surface-border flex items-start justify-between gap-3 sticky top-0 bg-white z-10">
            <div className="min-w-0">
              <Dialog.Title className="font-display font-bold text-lg text-brand-900">
                Yeni Tedarikçi Davet Et
              </Dialog.Title>
              <Dialog.Description className="text-sm text-slate-500 mt-0.5">
                Tedarikçilere kayıt linkini içeren e-posta gönderin
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                aria-label="Kapat"
                className="p-1.5 rounded-lg hover:bg-surface-muted text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </header>

          <form onSubmit={handleSubmit} className="px-5 py-5 space-y-4">
            <div className="rounded-lg bg-brand-50 border border-brand-100 p-3 text-sm text-brand-800 flex gap-2">
              <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                Davet linkleri <strong>7 gün</strong> geçerli olur. Tedarikçi
                kayıt formunu doldurduktan sonra Supkeys ekibi başvuruyu
                inceler ve onaylarsa hesabı aktif edilir.
              </p>
            </div>

            <Field
              error={
                overLimit
                  ? `Çok fazla e-posta (max ${MAX_EMAILS})`
                  : undefined
              }
              hint={
                !overLimit
                  ? "Birden fazla e-posta için virgülle, noktalı virgülle veya satır sonu ile ayırın"
                  : undefined
              }
            >
              <Label htmlFor="emails-raw" required>
                E-posta Adresleri
              </Label>
              <Textarea
                id="emails-raw"
                rows={3}
                placeholder="ali@firma.com, mehmet@firma2.com"
                value={emailsRaw}
                onChange={(e) => setEmailsRaw(e.target.value)}
                hasError={overLimit}
              />
              {parsed.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {parsed.map((p) => {
                    const failedReason = failedEmails.get(p.email);
                    const isFailed = !!failedReason;
                    return (
                      <span
                        key={p.email}
                        className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs border",
                          !p.valid || isFailed
                            ? "bg-danger-50 text-danger-700 border-danger-200"
                            : "bg-success-50 text-success-700 border-success-200",
                        )}
                        title={
                          !p.valid
                            ? "Geçersiz e-posta formatı"
                            : isFailed
                              ? reasonLabel(failedReason)
                              : "Geçerli"
                        }
                      >
                        {p.email}
                        {(!p.valid || isFailed) && (
                          <AlertTriangle className="h-3 w-3" />
                        )}
                      </span>
                    );
                  })}
                </div>
              )}
              <p className="text-xs text-slate-500 mt-1">
                {validEmails.length} geçerli
                {invalidCount > 0 && `, ${invalidCount} hatalı`}
                {" "}(max {MAX_EMAILS})
              </p>
            </Field>

            <Field hint="Tüm e-postalarda aynı isim kullanılır (opsiyonel)">
              <Label htmlFor="contact-name">Yetkili Kişi Adı</Label>
              <Input
                id="contact-name"
                placeholder="Sayın Ali Bey"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                maxLength={150}
              />
            </Field>

            <Field>
              <div className="flex items-center justify-between mb-1.5">
                <Label htmlFor="message" className="mb-0">
                  Kişisel Mesaj
                </Label>
                <span className="text-xs text-slate-400 tabular-nums">
                  {message.length} / {MAX_MESSAGE}
                </span>
              </div>
              <Textarea
                id="message"
                rows={4}
                maxLength={MAX_MESSAGE}
                placeholder="Sayın yetkili, sizi tedarikçi ağımıza davet ediyoruz."
                value={message}
                onChange={(e) =>
                  setMessage(e.target.value.slice(0, MAX_MESSAGE))
                }
              />
            </Field>

            <button
              type="button"
              onClick={() => setPreviewOpen((v) => !v)}
              className="text-sm text-brand-600 hover:text-brand-700 font-medium inline-flex items-center gap-1"
            >
              <Eye className="h-4 w-4" />
              E-posta Önizlemesini {previewOpen ? "Gizle" : "Göster"}
              <ChevronDown
                className={cn(
                  "h-4 w-4 transition-transform",
                  previewOpen && "rotate-180",
                )}
              />
            </button>

            {previewOpen && (
              <EmailPreviewPanel
                contactName={contactName}
                message={message}
                enabled={previewOpen}
              />
            )}

            <footer className="flex items-center gap-2 pt-2 border-t border-surface-border -mx-5 px-5">
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                className="flex-1"
                disabled={batch.isPending}
              >
                Vazgeç
              </Button>
              <Button
                type="submit"
                loading={batch.isPending}
                disabled={
                  batch.isPending || validEmails.length === 0 || overLimit
                }
                className="flex-1"
              >
                {validEmails.length > 0
                  ? `${validEmails.length} Davet Gönder`
                  : "Davet Gönder"}
              </Button>
            </footer>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function failedEmailsContains(
  data: BatchInvitationResponse,
  email: string,
): boolean {
  return data.results.some((r) => r.email === email && !r.success);
}
