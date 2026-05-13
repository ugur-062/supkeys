"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCreateInvitation } from "@/hooks/use-supplier-invitations";
import { extractErrorMessage } from "@/lib/tenders/error";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import * as Dialog from "@radix-ui/react-dialog";
import { Info, Send, UserPlus2, X } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const schema = z.object({
  email: z
    .string()
    .email("Geçerli bir e-posta adresi giriniz")
    .max(200, "En fazla 200 karakter"),
  contactName: z
    .string()
    .max(150, "En fazla 150 karakter")
    .optional()
    .or(z.literal("")),
  message: z
    .string()
    .max(1000, "En fazla 1000 karakter")
    .optional()
    .or(z.literal("")),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
  /** Wizard'da girilen ihale başlığı (henüz number yok, draft). */
  tenderTitle: string;
  /** Davet kabul edilince callback (parent listeyi yenileyebilir). */
  onInvited?: (email: string) => void;
}

/**
 * V2-6.5 — İhale wizard Step 3 içinden tedarikçi davet modal'ı.
 * Davet edilen kişiye giden e-postada ihale başlığı + buyer'ın custom mesajı
 * birleştirilir. Kabul edildikten sonra tedarikçi ACTIVE olur; bu sonra alıcı
 * ihaleye manuel olarak ekleyebilir (V2-7'de otomatik ihaleye bağlama gelecek).
 */
export function InviteSupplierFromTenderModal({
  open,
  onClose,
  tenderTitle,
  onInvited,
}: Props) {
  const mutation = useCreateInvitation();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", contactName: "", message: "" },
  });

  useEffect(() => {
    if (open) {
      form.reset({ email: "", contactName: "", message: "" });
    }
  }, [open, form]);

  const onSubmit = (values: FormValues) => {
    // İhale bağlamını otomatik prepend et — buyer'ın özel mesajı varsa ardına ekle
    const contextLine = tenderTitle
      ? `Bu davet "${tenderTitle}" ihalemiz kapsamında gönderildi. Kaydınızı tamamladıktan sonra ihale detayları size iletilecektir.`
      : "";
    const userMsg = values.message?.trim() ?? "";
    const finalMessage = [contextLine, userMsg].filter(Boolean).join("\n\n");

    mutation.mutate(
      {
        email: values.email.trim().toLowerCase(),
        contactName: values.contactName?.trim() || undefined,
        message: finalMessage || undefined,
      },
      {
        onSuccess: () => {
          toast.success(
            `${values.email} adresine davet gönderildi`,
            {
              description:
                "Tedarikçi kaydını tamamladığında onaylı listenizde görünür.",
            },
          );
          onInvited?.(values.email);
          onClose();
        },
        onError: (err) => {
          toast.error(
            extractErrorMessage(err, "Davet gönderilemedi"),
          );
        },
      },
    );
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o && !mutation.isPending) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-slate-900/60" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-[60] -translate-x-1/2 -translate-y-1/2",
            "w-[calc(100vw-2rem)] max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl outline-none",
          )}
        >
          <header className="flex items-start justify-between gap-3 border-b border-surface-border px-5 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand-50">
                <UserPlus2 className="h-5 w-5 text-brand-600" />
              </div>
              <div>
                <Dialog.Title className="font-display text-lg font-bold text-brand-900">
                  Yeni Tedarikçi Davet Et
                </Dialog.Title>
                <Dialog.Description className="mt-0.5 text-sm text-slate-500">
                  Henüz Supkeys'te olmayan bir tedarikçiyi sisteme davet edin.
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Kapat"
                disabled={mutation.isPending}
                className="flex-shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-surface-muted hover:text-slate-600 disabled:opacity-40"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </header>

          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4 px-5 py-5"
            noValidate
          >
            {/* İhale bağlam kartı */}
            {tenderTitle ? (
              <div className="flex items-start gap-2 rounded-lg border border-brand-200 bg-brand-50/40 p-3 text-xs text-brand-800">
                <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-600" />
                <div>
                  <p className="font-semibold">
                    İhale bağlamı otomatik eklenir
                  </p>
                  <p className="mt-1 text-slate-600">
                    Davet e-postasında <strong>{tenderTitle}</strong>{" "}
                    ihalesinin bilgisi yer alacak. Tedarikçi kaydı kabul
                    ettikten sonra ihale detayları kendisine iletilir.
                  </p>
                </div>
              </div>
            ) : null}

            <Field error={form.formState.errors.email?.message}>
              <Label htmlFor="invite-email" required>
                E-posta
              </Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="tedarikci@firma.com"
                autoComplete="off"
                hasError={!!form.formState.errors.email}
                {...form.register("email")}
              />
            </Field>

            <Field
              error={form.formState.errors.contactName?.message}
              hint="Opsiyonel — biliyorsanız davet personalize edilir"
            >
              <Label htmlFor="invite-contactName">İletişim Kişisi</Label>
              <Input
                id="invite-contactName"
                placeholder="Ad Soyad"
                hasError={!!form.formState.errors.contactName}
                {...form.register("contactName")}
              />
            </Field>

            <Field
              error={form.formState.errors.message?.message}
              hint="Opsiyonel — e-postada görünecek ek bir not"
            >
              <Label htmlFor="invite-message">Ek Mesaj</Label>
              <Textarea
                id="invite-message"
                rows={3}
                placeholder="Tedarikçiye özel bir notunuz varsa yazın…"
                hasError={!!form.formState.errors.message}
                {...form.register("message")}
              />
            </Field>
          </form>

          <footer className="flex items-center gap-2 border-t border-surface-border px-5 py-4">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={mutation.isPending}
              className="flex-1"
            >
              Vazgeç
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={form.handleSubmit(onSubmit)}
              loading={mutation.isPending}
              disabled={mutation.isPending}
              className="flex-1"
            >
              <Send className="h-4 w-4" />
              Daveti Gönder
            </Button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
