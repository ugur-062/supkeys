"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUpdateUser } from "@/hooks/use-tenant-users";
import type { UserRole } from "@/lib/auth/types";
import { extractErrorMessage } from "@/lib/tenders/error";
import { USER_ROLE_LABELS } from "@/lib/users/labels";
import type { TenantUserListItem } from "@/lib/users/types";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import * as Dialog from "@radix-ui/react-dialog";
import { Pencil, X } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const ROLES: UserRole[] = ["COMPANY_ADMIN", "BUYER", "APPROVER"];

const schema = z.object({
  firstName: z.string().min(2, "En az 2 karakter").max(80),
  lastName: z.string().min(2, "En az 2 karakter").max(80),
  phone: z.string().max(40).optional().or(z.literal("")),
  role: z.enum(["COMPANY_ADMIN", "BUYER", "APPROVER"]),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  user: TenantUserListItem | null;
  onClose: () => void;
}

export function EditUserModal({ user, onClose }: Props) {
  const updateMutation = useUpdateUser();
  const open = Boolean(user);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { firstName: "", lastName: "", phone: "", role: "BUYER" },
  });

  useEffect(() => {
    if (user) {
      form.reset({
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone ?? "",
        role: user.role,
      });
    }
  }, [user, form]);

  if (!user) return null;

  const onSubmit = (values: FormValues) => {
    updateMutation.mutate(
      {
        id: user.id,
        payload: {
          firstName: values.firstName,
          lastName: values.lastName,
          phone: values.phone?.trim() || undefined,
          role: values.role,
        },
      },
      {
        onSuccess: () => {
          toast.success("Kullanıcı güncellendi");
          onClose();
        },
        onError: (err) => {
          toast.error(extractErrorMessage(err, "Güncelleme başarısız"));
        },
      },
    );
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o && !updateMutation.isPending) onClose();
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
                <Pencil className="w-5 h-5 text-brand-600" />
              </div>
              <div>
                <Dialog.Title className="font-display font-bold text-lg text-brand-900">
                  Kullanıcıyı Düzenle
                </Dialog.Title>
                <Dialog.Description className="text-sm text-slate-500 mt-0.5">
                  {user.email}
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Kapat"
                disabled={updateMutation.isPending}
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
            <div className="grid grid-cols-2 gap-3">
              <Field error={form.formState.errors.firstName?.message}>
                <Label htmlFor="edit-firstName">Ad</Label>
                <Input
                  id="edit-firstName"
                  hasError={!!form.formState.errors.firstName}
                  {...form.register("firstName")}
                />
              </Field>
              <Field error={form.formState.errors.lastName?.message}>
                <Label htmlFor="edit-lastName">Soyad</Label>
                <Input
                  id="edit-lastName"
                  hasError={!!form.formState.errors.lastName}
                  {...form.register("lastName")}
                />
              </Field>
            </div>

            <Field error={form.formState.errors.phone?.message} hint="Opsiyonel">
              <Label htmlFor="edit-phone">Telefon</Label>
              <Input
                id="edit-phone"
                {...form.register("phone")}
              />
            </Field>

            <Field>
              <Label>Rol</Label>
              <div className="space-y-2 mt-1">
                {ROLES.map((role) => {
                  const meta = USER_ROLE_LABELS[role];
                  const isSelected = form.watch("role") === role;
                  return (
                    <label
                      key={role}
                      className={cn(
                        "flex gap-3 p-2.5 rounded-lg border cursor-pointer text-sm transition",
                        isSelected
                          ? "border-brand-400 bg-brand-50/40"
                          : "border-slate-200 bg-white hover:border-brand-300",
                      )}
                    >
                      <input
                        type="radio"
                        value={role}
                        {...form.register("role")}
                        className="mt-0.5 h-4 w-4 text-brand-600"
                      />
                      <span>
                        <span className="font-semibold text-brand-900">
                          {meta.label}
                        </span>
                        <span className="text-xs text-slate-500 block mt-0.5">
                          {meta.description}
                        </span>
                      </span>
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
              disabled={updateMutation.isPending}
              className="flex-1"
            >
              Vazgeç
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={form.handleSubmit(onSubmit)}
              loading={updateMutation.isPending}
              disabled={updateMutation.isPending}
              className="flex-1"
            >
              Kaydet
            </Button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
