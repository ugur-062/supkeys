"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUpdateUser } from "@/hooks/use-tenant-users";
import type { UserRole } from "@/lib/auth/types";
import {
  computePermissionsOverride,
  isPermissionForbiddenForRole,
  PERMISSION_GROUPS,
  ROLE_DEFAULT_PERMISSIONS,
} from "@/lib/permissions";
import { extractErrorMessage } from "@/lib/tenders/error";
import { USER_ROLE_LABELS } from "@/lib/users/labels";
import type { TenantUserListItem } from "@/lib/users/types";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, Pencil, RotateCcw, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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

  // V2-6.5 — efektif permission listesi (Set), role değiştikçe default'a senkronize
  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (user) {
      form.reset({
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone ?? "",
        role: user.role,
      });
      // BUG FIX #5 — Edge case: kullanıcı tüm permission'lar override ile
      // boşaltılmışsa (`permissions: []`), `length > 0` kontrolü fallback'e
      // düşüyordu ve admin GERÇEK durumu (boş) yerine role default görüyordu.
      // Düzeltme: hasCustomPermissions flag'i true ise permissions array'i
      // gerçek durumdur (boş bile olsa). Sadece flag false (saf default)
      // veya array undefined ise role default'una düş.
      const initial =
        user.hasCustomPermissions === true
          ? (user.permissions ?? [])
          : user.permissions && user.permissions.length > 0
            ? user.permissions
            : (ROLE_DEFAULT_PERMISSIONS[user.role] ?? []);
      setSelectedPerms(new Set(initial));
    }
  }, [user, form]);

  const role = form.watch("role");

  const handleRoleChange = (newRole: UserRole) => {
    form.setValue("role", newRole, { shouldValidate: true });
    // Rol değişiminde permission seti otomatik yeni rol default'una geçer
    setSelectedPerms(new Set(ROLE_DEFAULT_PERMISSIONS[newRole] ?? []));
  };

  const togglePerm = (key: string) => {
    setSelectedPerms((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const override = useMemo(
    () => computePermissionsOverride(role as UserRole, Array.from(selectedPerms)),
    [role, selectedPerms],
  );
  const isCustomized = override !== null;

  const resetToDefault = () => {
    setSelectedPerms(
      new Set(ROLE_DEFAULT_PERMISSIONS[role as UserRole] ?? []),
    );
  };

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
          permissionsOverride: override,
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
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-slate-900/60" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-[60] -translate-x-1/2 -translate-y-1/2",
            "flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl outline-none",
          )}
        >
          <header className="flex items-start justify-between gap-3 border-b border-surface-border px-5 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand-50">
                <Pencil className="h-5 w-5 text-brand-600" />
              </div>
              <div>
                <Dialog.Title className="font-display text-lg font-bold text-brand-900">
                  Kullanıcıyı Düzenle
                </Dialog.Title>
                <Dialog.Description className="mt-0.5 text-sm text-slate-500">
                  {user.email}
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Kapat"
                disabled={updateMutation.isPending}
                className="flex-shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-surface-muted hover:text-slate-600 disabled:opacity-40"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </header>

          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex-1 space-y-5 overflow-y-auto px-5 py-5"
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

            <Field
              error={form.formState.errors.phone?.message}
              hint="Opsiyonel"
            >
              <Label htmlFor="edit-phone">Telefon</Label>
              <Input id="edit-phone" {...form.register("phone")} />
            </Field>

            <Field>
              <Label>Rol</Label>
              <div className="mt-1 space-y-2">
                {ROLES.map((r) => {
                  const meta = USER_ROLE_LABELS[r];
                  const isSelected = role === r;
                  return (
                    <label
                      key={r}
                      className={cn(
                        "flex cursor-pointer gap-3 rounded-lg border p-2.5 text-sm transition",
                        isSelected
                          ? "border-brand-400 bg-brand-50/40"
                          : "border-slate-200 bg-white hover:border-brand-300",
                      )}
                    >
                      <input
                        type="radio"
                        value={r}
                        checked={isSelected}
                        onChange={() => handleRoleChange(r)}
                        className="mt-0.5 h-4 w-4 text-brand-600"
                      />
                      <span>
                        <span className="font-semibold text-brand-900">
                          {meta.label}
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-500">
                          {meta.description}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </Field>

            {/* V2-6.5 — Yetkiler */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-bold text-brand-900">Yetkiler</p>
                  {isCustomized ? (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-warning-700">
                      <AlertTriangle className="h-3 w-3" />
                      Rol varsayılanından farklı (özelleştirilmiş)
                    </p>
                  ) : (
                    <p className="mt-0.5 text-xs text-slate-500">
                      Rolün varsayılan yetkileri uygulanıyor.
                    </p>
                  )}
                </div>
                {isCustomized ? (
                  <button
                    type="button"
                    onClick={resetToDefault}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Varsayılana Dön
                  </button>
                ) : null}
              </div>

              <div className="space-y-4">
                {PERMISSION_GROUPS.map((group) => (
                  <div key={group.label}>
                    <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                      {group.label}
                    </p>
                    <div className="space-y-0.5">
                      {group.items.map((item) => {
                        const isChecked = selectedPerms.has(item.key);
                        const isDefault = (
                          ROLE_DEFAULT_PERMISSIONS[role as UserRole] ?? []
                        ).includes(item.key);
                        // V2-6.5 — Rol bazlı yasak izin: COMPANY_ADMIN'e
                        // tender:create verilemez. Toggle disabled + tooltip.
                        const forbidden = isPermissionForbiddenForRole(
                          role as UserRole,
                          item.key,
                        );
                        return (
                          <label
                            key={item.key}
                            title={
                              forbidden
                                ? "Bu yetki bu rol için verilemez"
                                : undefined
                            }
                            className={cn(
                              "flex items-start gap-2 rounded px-2 py-1.5",
                              forbidden
                                ? "cursor-not-allowed opacity-50"
                                : "cursor-pointer hover:bg-white",
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked && !forbidden}
                              disabled={forbidden}
                              onChange={() => {
                                if (forbidden) return;
                                togglePerm(item.key);
                              }}
                              className="mt-0.5 h-4 w-4 rounded text-brand-600 disabled:cursor-not-allowed"
                            />
                            <span
                              className={cn(
                                "text-sm",
                                forbidden
                                  ? "text-slate-400 line-through"
                                  : isChecked
                                    ? "font-medium text-slate-900"
                                    : "text-slate-600",
                              )}
                            >
                              {item.label}
                              {forbidden ? (
                                <span className="ml-1 text-[10px] font-semibold uppercase text-slate-400">
                                  yasak
                                </span>
                              ) : !isDefault && isChecked ? (
                                <span className="ml-1 text-[10px] font-semibold uppercase text-warning-600">
                                  +
                                </span>
                              ) : isDefault && !isChecked ? (
                                <span className="ml-1 text-[10px] font-semibold uppercase text-danger-600">
                                  −
                                </span>
                              ) : null}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </form>

          <footer className="flex items-center gap-2 border-t border-surface-border px-5 py-4">
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
