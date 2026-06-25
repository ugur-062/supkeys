"use client";

import { Button } from "@/components/catalyst/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCreateInvitation } from "@/hooks/use-supplier-invitations";
import { extractErrorMessage } from "@/lib/tenders/error";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info, Send, UserPlus2 } from "lucide-react";
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
          toast.success(`${values.email} adresine davet gönderildi`, {
            description:
              "Tedarikçi kaydını tamamladığında onaylı listenizde görünür.",
          });
          onInvited?.(values.email);
          onClose();
        },
        onError: (err) => {
          toast.error(extractErrorMessage(err, "Davet gönderilemedi"));
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!mutation.isPending) onClose();
      }}
      size="lg"
    >
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100">
            <UserPlus2 className="h-5 w-5 text-zinc-700" />
          </div>
          <div>
            <DialogTitle>Yeni Tedarikçi Davet Et</DialogTitle>
            <DialogDescription>
              Henüz Rothern'te olmayan bir tedarikçiyi sisteme davet edin.
            </DialogDescription>
          </div>
        </div>

        <DialogBody className="space-y-4">
          {/* İhale bağlam kartı */}
          {tenderTitle ? (
            <div className="flex items-start gap-2 rounded-lg ring-1 ring-zinc-950/10 bg-zinc-50 p-3 text-xs text-zinc-700">
              <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-zinc-500" />
              <div>
                <p className="font-semibold text-zinc-900">
                  İhale bağlamı otomatik eklenir
                </p>
                <p className="mt-1 text-zinc-600">
                  Davet e-postasında <strong>{tenderTitle}</strong> ihalesinin
                  bilgisi yer alacak. Tedarikçi kaydı kabul ettikten sonra ihale
                  detayları kendisine iletilir.
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
        </DialogBody>

        <DialogActions>
          <Button plain onClick={onClose} disabled={mutation.isPending}>
            Vazgeç
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            <Send data-slot="icon" />
            Daveti Gönder
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
