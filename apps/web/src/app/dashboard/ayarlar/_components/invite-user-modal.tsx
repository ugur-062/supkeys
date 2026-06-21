"use client";

import { Button } from "@/components/catalyst/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "@/components/catalyst/dialog";
import {
  Description as RadioDescription,
  Label as RadioLabel,
} from "@/components/catalyst/fieldset";
import { Radio, RadioField, RadioGroup } from "@/components/catalyst/radio";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBuyerSeatUsage, useInviteUser } from "@/hooks/use-tenant-users";
import type { UserRole } from "@/lib/auth/types";
import { extractErrorMessage } from "@/lib/tenders/error";
import { USER_ROLE_LABELS } from "@/lib/users/labels";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, Send, UserPlus2 } from "lucide-react";
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
  const buyerSeats = useBuyerSeatUsage();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", role: "BUYER" },
  });

  useEffect(() => {
    if (open) form.reset({ email: "", role: "BUYER" });
  }, [open, form]);

  const selectedRole = form.watch("role");
  const buyerSeatsFull =
    selectedRole === "BUYER" &&
    buyerSeats.data !== undefined &&
    buyerSeats.data.used >= buyerSeats.data.limit;

  const onSubmit = (values: FormValues) => {
    if (values.role === "BUYER" && buyerSeatsFull) {
      toast.error("Satın Almacı kontenjanı dolu");
      return;
    }
    inviteMutation.mutate(
      { email: values.email.trim().toLowerCase(), role: values.role },
      {
        onSuccess: () => {
          toast.success(`${values.email} adresine davet e-postası gönderildi`);
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
        if (!inviteMutation.isPending) onClose();
      }}
      size="lg"
    >
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100">
            <UserPlus2 className="h-5 w-5 text-zinc-700" />
          </div>
          <div>
            <DialogTitle>Üye Davet Et</DialogTitle>
            <DialogDescription>
              Davet e-postası 7 gün geçerli olur.
            </DialogDescription>
          </div>
        </div>

        <DialogBody className="space-y-4">
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
            <RadioGroup
              value={selectedRole}
              onChange={(v) =>
                form.setValue("role", v as UserRole, { shouldValidate: true })
              }
              className="space-y-2 mt-1"
            >
              {ROLES.map((role) => {
                const meta = USER_ROLE_LABELS[role];
                const isSelected = selectedRole === role;
                return (
                  <RadioField
                    key={role}
                    className={cn(
                      "rounded-xl p-3 ring-1 transition",
                      isSelected
                        ? "ring-2 ring-zinc-900 bg-zinc-50"
                        : "ring-zinc-950/10 hover:ring-zinc-300",
                    )}
                  >
                    <Radio value={role} />
                    <RadioLabel className="!text-sm font-bold text-zinc-900">
                      {meta.label}
                    </RadioLabel>
                    <RadioDescription className="text-xs text-zinc-600">
                      {meta.description}
                    </RadioDescription>
                  </RadioField>
                );
              })}
            </RadioGroup>
          </Field>

          {/* V2-6.5 — BUYER kontenjan göstergesi */}
          {selectedRole === "BUYER" && buyerSeats.data ? (
            <div
              className={cn(
                "flex items-start gap-2 rounded-lg border px-3 py-2 text-xs",
                buyerSeatsFull
                  ? "border-warning-200 bg-warning-50 text-warning-800"
                  : "border-zinc-200 bg-zinc-50 text-zinc-700",
              )}
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <div>
                <p className="font-semibold">
                  Satın Almacı kontenjanı: {buyerSeats.data.used}/
                  {buyerSeats.data.limit}
                </p>
                <p className="mt-0.5 opacity-90">
                  {buyerSeatsFull
                    ? "Kontenjan dolu. Yeni satın almacı davet edemezsiniz; super-admin'den kontenjan artırımı talep edin."
                    : `${buyerSeats.data.active} aktif · ${buyerSeats.data.pending} bekleyen davet.`}
                </p>
              </div>
            </div>
          ) : null}
        </DialogBody>

        <DialogActions>
          <Button plain onClick={onClose} disabled={inviteMutation.isPending}>
            Vazgeç
          </Button>
          <Button
            type="submit"
            disabled={inviteMutation.isPending || buyerSeatsFull}
          >
            <Send data-slot="icon" />
            Davet Gönder
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
