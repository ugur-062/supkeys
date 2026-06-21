"use client";

import { Button } from "@/components/catalyst/button";
import { Checkbox } from "@/components/catalyst/checkbox";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Radio, RadioGroup } from "@/components/catalyst/radio";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBuyerSeatUsage, useUpdateUser } from "@/hooks/use-tenant-users";
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
import { AlertCircle, AlertTriangle, Pencil, RotateCcw } from "lucide-react";
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
  const buyerSeats = useBuyerSeatUsage();
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

  // V2-6.5 — BUYER'a yükseltme kontrolü. Kullanıcı zaten BUYER ise saymıyoruz.
  const isPromotingToBuyer = Boolean(
    role === "BUYER" && user && user.role !== "BUYER",
  );
  const buyerSeatsFullForPromotion = Boolean(
    isPromotingToBuyer &&
      buyerSeats.data !== undefined &&
      buyerSeats.data.used >= buyerSeats.data.limit,
  );

  if (!user) return null;

  const onSubmit = (values: FormValues) => {
    if (buyerSeatsFullForPromotion) {
      toast.error("Satın Almacı kontenjanı dolu");
      return;
    }
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
    <Dialog
      open={open}
      onClose={() => {
        if (!updateMutation.isPending) onClose();
      }}
      size="2xl"
    >
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-zinc-100">
            <Pencil className="h-5 w-5 text-zinc-700" />
          </div>
          <div>
            <DialogTitle>Kullanıcıyı Düzenle</DialogTitle>
            <DialogDescription>{user.email}</DialogDescription>
          </div>
        </div>

        <DialogBody className="space-y-5">
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
              <RadioGroup
                value={role}
                onChange={(v) => handleRoleChange(v as UserRole)}
                className="mt-1 space-y-2"
              >
                {ROLES.map((r) => {
                  const meta = USER_ROLE_LABELS[r];
                  const isSelected = role === r;
                  // V2-6.5 — Kullanıcı zaten BUYER değilse ve kontenjan
                  // doluysa BUYER seçeneği disabled görünür.
                  const seatsBlockBuyer =
                    r === "BUYER" &&
                    user.role !== "BUYER" &&
                    buyerSeats.data !== undefined &&
                    buyerSeats.data.used >= buyerSeats.data.limit;
                  return (
                    <div
                      key={r}
                      title={
                        seatsBlockBuyer
                          ? "Satın Almacı kontenjanı dolu"
                          : undefined
                      }
                      className={cn(
                        "flex gap-3 rounded-lg p-2.5 text-sm transition ring-1",
                        seatsBlockBuyer
                          ? "ring-zinc-950/10 bg-zinc-50 opacity-60"
                          : isSelected
                            ? "ring-2 ring-zinc-900 bg-zinc-50"
                            : "ring-zinc-950/10 bg-white",
                      )}
                    >
                      <Radio
                        value={r}
                        disabled={seatsBlockBuyer}
                        className="mt-0.5"
                      />
                      <span>
                        <span className="font-semibold text-zinc-900">
                          {meta.label}
                          {seatsBlockBuyer ? (
                            <span className="ml-1 text-[10px] font-semibold uppercase text-warning-700">
                              kontenjan dolu
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block text-xs text-zinc-500">
                          {meta.description}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </RadioGroup>
            </Field>

            {/* V2-6.5 — BUYER kontenjan göstergesi (sadece BUYER seçildiğinde) */}
            {role === "BUYER" && buyerSeats.data ? (
              <div
                className={cn(
                  "flex items-start gap-2 rounded-lg border px-3 py-2 text-xs",
                  buyerSeatsFullForPromotion
                    ? "border-warning-200 bg-warning-50 text-warning-800"
                    : "border-brand-200 bg-brand-50/40 text-brand-800",
                )}
              >
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold">
                    Satın Almacı kontenjanı: {buyerSeats.data.used}/
                    {buyerSeats.data.limit}
                  </p>
                  <p className="mt-0.5 opacity-90">
                    {buyerSeatsFullForPromotion
                      ? "Kontenjan dolu. Bu kullanıcıyı satın almacıya yükseltemezsiniz."
                      : `${buyerSeats.data.active} aktif · ${buyerSeats.data.pending} bekleyen davet.`}
                  </p>
                </div>
              </div>
            ) : null}

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
                          <div
                            key={item.key}
                            title={
                              forbidden
                                ? "Bu yetki bu rol için verilemez"
                                : undefined
                            }
                            className={cn(
                              "flex items-start gap-2 rounded px-2 py-1.5",
                              forbidden ? "opacity-50" : "hover:bg-white",
                            )}
                          >
                            <Checkbox
                              checked={isChecked && !forbidden}
                              disabled={forbidden}
                              onChange={() => {
                                if (forbidden) return;
                                togglePerm(item.key);
                              }}
                              className="mt-0.5"
                            />
                            <span
                              className={cn(
                                "text-sm",
                                forbidden
                                  ? "text-zinc-400 line-through"
                                  : isChecked
                                    ? "font-medium text-zinc-900"
                                    : "text-zinc-600",
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
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
        </DialogBody>

        <DialogActions>
          <Button plain onClick={onClose} disabled={updateMutation.isPending}>
            Vazgeç
          </Button>
          <Button
            type="submit"
            disabled={updateMutation.isPending || buyerSeatsFullForPromotion}
          >
            Kaydet
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
