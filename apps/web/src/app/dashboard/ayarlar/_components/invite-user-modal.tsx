"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useInviteUser } from "@/hooks/use-tenant-users";
import type { UserRole } from "@/lib/auth/types";
import { extractErrorMessage } from "@/lib/tenders/error";
import { USER_ROLE_LABELS } from "@/lib/users/labels";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import * as Dialog from "@radix-ui/react-dialog";
import { Send, UserPlus2, X } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const ROLES: UserRole[] = ["COMPANY_ADMIN", "BUYER", "APPROVER"];

const schema = z.object({
  email: z.string().email("Geçerli bir e-posta girin").max(200),
  role: z.enum(["COMPANY_ADMIN", "BUYER", "APPROVER"]),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
}

export function InviteUserModal({ open, onClose }: Props) {
  const inviteMutation = useInviteUser();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", role: "BUYER" },
  });

  useEffect(() => {
    if (open) form.reset({ email: "", role: "BUYER" });
  }, [open, form]);

  const onSubmit = (values: FormValues) => {
    inviteMutation.mutate(
      { email: values.email.trim().toLowerCase(), role: values.role },
      {
        onSuccess: () => {
          toast.success(
            `${values.email} adresine davet e-postası gönderildi`,
          );
          onClose();
        },
        onError: (err) => {
          toast.error(extractErrorMessage(err, "Davet gönderilemedi"));
        },
      },
    );
  };

  const selectedRole = form.watch("role");

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o && !inviteMutation.isPending) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-900/60 z-[60]" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[60]",
            "w-[calc(100vw-2rem)] max-w-lg bg-white rounded-2xl shadow-2xl outline-none",
          )}
        >
          <header className="px-5 py-4 border-b border-surface-border flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0">
                <UserPlus2 className="w-5 h-5 text-brand-600" />
              </div>
              <div>
                <Dialog.Title className="font-display font-bold text-lg text-brand-900">
                  Üye Davet Et
                </Dialog.Title>
                <Dialog.Description className="text-sm text-slate-500 mt-0.5">
                  Davet e-postası 7 gün geçerli olur.
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Kapat"
                disabled={inviteMutation.isPending}
                className="p-1.5 rounded-lg hover:bg-surface-muted text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0 disabled:opacity-40"
              >
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </header>

          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="px-5 py-5 space-y-4"
            noValidate
          >
            <Field error={form.formState.errors.email?.message}>
              <Label htmlFor="invite-email">E-posta</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="ornek@sirket.com"
                autoFocus
                hasError={!!form.formState.errors.email}
                {...form.register("email")}
              />
            </Field>

            <Field>
              <Label>Rol</Label>
              <div className="space-y-2 mt-1">
                {ROLES.map((role) => {
                  const meta = USER_ROLE_LABELS[role];
                  const isSelected = selectedRole === role;
                  return (
                    <label
                      key={role}
                      className={cn(
                        "flex gap-3 p-3 rounded-xl border-2 cursor-pointer transition",
                        isSelected
                          ? "border-brand-400 bg-brand-50/40 ring-2 ring-brand-100"
                          : "border-slate-200 bg-white hover:border-brand-300",
                      )}
                    >
                      <input
                        type="radio"
                        value={role}
                        {...form.register("role")}
                        className="mt-1 h-4 w-4 text-brand-600"
                      />
                      <div>
                        <p className="font-bold text-brand-900 text-sm">
                          {meta.label}
                        </p>
                        <p className="text-xs text-slate-600 mt-0.5">
                          {meta.description}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </Field>
          </form>

          <footer className="px-5 py-4 border-t border-surface-border flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={inviteMutation.isPending}
              className="flex-1"
            >
              Vazgeç
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={form.handleSubmit(onSubmit)}
              loading={inviteMutation.isPending}
              disabled={inviteMutation.isPending}
              className="flex-1"
            >
              <Send className="w-4 h-4" />
              Davet Gönder
            </Button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
