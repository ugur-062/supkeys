"use client";

import { InvitationBanner } from "@/components/registration/invitation-banner";
import { StepFirmInfo } from "@/components/registration/step-firm-info";
import { StepSuccess } from "@/components/registration/step-success";
import { StepUserInfo } from "@/components/registration/step-user-info";
import { Stepper } from "@/components/registration/stepper";
import { Button } from "@/components/ui/button";
import {
  fetchSupplierInvitationInfo,
  submitSupplierApplication,
  type SupplierInvitationInfo,
} from "@/lib/registration/api";
import {
  FIRM_FIELDS,
  USER_FIELDS,
  fullRegistrationSchema,
  type FullRegistration,
} from "@/lib/registration/schemas";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import axios from "axios";
import { AlertTriangle, ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

type StepNo = 1 | 2 | 3;

interface SupplierRegisterFormProps {
  invitationToken?: string;
}

export function SupplierRegisterForm({
  invitationToken,
}: SupplierRegisterFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<StepNo>(1);
  const [submittedEmail, setSubmittedEmail] = useState<string>("");
  const [usedInviteToken, setUsedInviteToken] = useState<string | undefined>(
    invitationToken,
  );

  const inviteQuery = useQuery({
    queryKey: ["supplier-invitation-info", invitationToken],
    queryFn: () => fetchSupplierInvitationInfo(invitationToken!),
    enabled: !!invitationToken,
    retry: false,
  });

  useEffect(() => {
    if (!invitationToken || !inviteQuery.isError) return;
    const status = axios.isAxiosError(inviteQuery.error)
      ? inviteQuery.error.response?.status
      : undefined;
    if (status === 404 || status === 410) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("invitation");
      router.replace(
        `/register/supplier${params.toString() ? `?${params}` : ""}`,
      );
      setUsedInviteToken(undefined);
    }
  }, [
    invitationToken,
    inviteQuery.isError,
    inviteQuery.error,
    router,
    searchParams,
  ]);

  const inviteData: SupplierInvitationInfo | undefined = inviteQuery.data;
  const inviteError = inviteQuery.error;
  const inviteStatusCode =
    inviteError && axios.isAxiosError(inviteError)
      ? inviteError.response?.status
      : undefined;

  const form = useForm<FullRegistration>({
    resolver: zodResolver(fullRegistrationSchema),
    mode: "onBlur",
    defaultValues: {
      companyName: "",
      companyType: undefined as unknown as FullRegistration["companyType"],
      taxNumber: "",
      taxOffice: "",
      taxCertUrl: "",
      industry: "",
      website: "",
      city: "",
      district: "",
      addressLine: "",
      postalCode: "",
      adminFirstName: "",
      adminLastName: "",
      adminEmail: "",
      adminPhone: "",
      password: "",
      passwordConfirm: "",
      termsAccepted: false as unknown as true,
    },
  });

  useEffect(() => {
    if (inviteData?.email) {
      form.setValue("adminEmail", inviteData.email);
    }
    if (inviteData?.contactName) {
      const parts = inviteData.contactName.trim().split(/\s+/);
      const first = parts[0] ?? "";
      const last = parts.slice(1).join(" ");
      if (first) form.setValue("adminFirstName", first);
      if (last) form.setValue("adminLastName", last);
    }
  }, [inviteData?.email, inviteData?.contactName, form]);

  const submitMutation = useMutation({
    mutationFn: (values: FullRegistration) =>
      submitSupplierApplication(values, usedInviteToken),
    onSuccess: (data, variables) => {
      setSubmittedEmail(variables.adminEmail);
      setStep(3);
      toast.success(data.message ?? "Başvurunuz alındı");
    },
    onError: (err) => {
      const msg =
        axios.isAxiosError(err) &&
        (err.response?.data as { message?: string | string[] } | undefined)
          ?.message;
      const text = Array.isArray(msg) ? msg.join(", ") : msg;
      toast.error(text || "Başvuru gönderilemedi, lütfen tekrar deneyin.");
    },
  });

  const handleNext = async () => {
    if (step === 1) {
      const ok = await form.trigger(
        FIRM_FIELDS as unknown as readonly (keyof FullRegistration)[],
      );
      if (ok) setStep(2);
      return;
    }
    if (step === 2) {
      const ok = await form.trigger(
        USER_FIELDS as unknown as readonly (keyof FullRegistration)[],
      );
      if (!ok) return;
      submitMutation.mutate(form.getValues());
    }
  };

  if (inviteStatusCode === 409) {
    return (
      <div className="card p-8 text-center space-y-4">
        <div className="w-14 h-14 rounded-full bg-brand-50 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-7 h-7 text-brand-600" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-display font-bold text-brand-900">
            Bu davet zaten kullanılmış
          </h2>
          <p className="text-slate-600 text-sm">
            Bu tedarikçi davet bağlantısıyla daha önce bir kayıt oluşturulmuş.
            Hesabınız varsa giriş yapabilirsiniz.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 justify-center pt-2">
          <Link href="/login">
            <Button>Giriş Yap</Button>
          </Link>
          <Link href="/">
            <Button variant="secondary">Anasayfa</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (step === 3) {
    return (
      <div className="card p-6 md:p-8">
        <StepSuccess email={submittedEmail} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Stepper current={step} />

      {inviteStatusCode === 410 ? (
        <div className="rounded-xl border border-danger-500 bg-danger-50/50 p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-danger-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-slate-700">
            <p className="font-semibold text-danger-700">
              Davet süresi dolmuş
            </p>
            <p>
              Yeni bir davet için sizi davet eden firma ile iletişime geçin.
              Şimdilik normal kayıt akışıyla devam edebilirsiniz.
            </p>
          </div>
        </div>
      ) : null}

      {invitationToken && inviteQuery.isLoading ? (
        <div className="rounded-xl border border-surface-border bg-white p-5 flex items-center gap-3 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          Davet bilgileri yükleniyor…
        </div>
      ) : null}

      {inviteData && !inviteQuery.isLoading ? (
        <InvitationBanner
          type="supplier"
          expiresAt={inviteData.expiresAt}
          tenantName={inviteData.tenantName}
          email={inviteData.email}
          message={inviteData.message}
        />
      ) : null}

      <div className="card p-6 md:p-8">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleNext();
          }}
          noValidate
        >
          {step === 1 ? (
            <StepFirmInfo
              control={form.control}
              register={form.register}
              errors={form.formState.errors}
              watch={form.watch}
              setValue={form.setValue}
            />
          ) : (
            <StepUserInfo
              control={form.control}
              register={form.register}
              errors={form.formState.errors}
              watch={form.watch}
              emailPrefilled={!!inviteData?.email}
              emailPrefillNote={
                inviteData?.email
                  ? `Davet ${inviteData.email} adresine geldi — gerekirse değiştirebilirsiniz.`
                  : undefined
              }
            />
          )}

          <div className="flex items-center justify-between mt-8 gap-3">
            {step === 2 ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setStep(1)}
                disabled={submitMutation.isPending}
              >
                <ArrowLeft className="w-4 h-4" />
                Geri
              </Button>
            ) : (
              <span />
            )}

            <Button type="submit" loading={submitMutation.isPending}>
              {step === 1 ? (
                <>
                  İleri
                  <ArrowRight className="w-4 h-4" />
                </>
              ) : submitMutation.isPending ? (
                "Gönderiliyor..."
              ) : (
                "Başvuruyu Tamamla"
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
