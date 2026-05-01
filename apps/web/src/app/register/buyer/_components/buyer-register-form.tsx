"use client";

import { InvitationBanner } from "@/components/registration/invitation-banner";
import { StepFirmInfo } from "@/components/registration/step-firm-info";
import { StepSuccess } from "@/components/registration/step-success";
import { StepUserInfo } from "@/components/registration/step-user-info";
import { Stepper } from "@/components/registration/stepper";
import { Button } from "@/components/ui/button";
import {
  fetchBuyerInvitationInfo,
  submitBuyerApplication,
  type BuyerInvitationInfo,
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
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Clock,
  Info,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

type StepNo = 1 | 2 | 3;

interface BuyerRegisterFormProps {
  invitationToken: string;
}

interface ErrorCardProps {
  status?: number;
}

function ErrorCard({ status }: ErrorCardProps) {
  const meta =
    status === 410
      ? {
          icon: Clock,
          tone: "warning" as const,
          title: "Davet süresi dolmuş",
          description:
            "Bu davet bağlantısının geçerlilik süresi dolmuş. Yeni bir davet için Supkeys ekibiyle iletişime geçin veya yeni bir demo talep edin.",
        }
      : status === 409
        ? {
            icon: Info,
            tone: "brand" as const,
            title: "Bu davet zaten kullanılmış",
            description:
              "Bu davet bağlantısıyla daha önce bir kayıt oluşturulmuş. Hesabınız varsa giriş yapabilirsiniz.",
          }
        : {
            icon: AlertTriangle,
            tone: "danger" as const,
            title: "Davet linki geçersiz",
            description:
              "Bağlantı yanlış ya da artık kullanılamıyor. Lütfen Supkeys ekibiyle iletişime geçin veya yeni bir demo talep edin.",
          };

  const { icon: Icon } = meta;
  const ringTone =
    meta.tone === "warning"
      ? "bg-warning-50 text-warning-600"
      : meta.tone === "brand"
        ? "bg-brand-50 text-brand-600"
        : "bg-danger-50 text-danger-600";

  return (
    <div className="card p-8 text-center space-y-4">
      <div
        className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto ${ringTone}`}
      >
        <Icon className="w-7 h-7" />
      </div>
      <div className="space-y-2">
        <h2 className="text-xl font-display font-bold text-brand-900">
          {meta.title}
        </h2>
        <p className="text-slate-600 text-sm leading-relaxed">
          {meta.description}
        </p>
      </div>
      <div className="flex flex-wrap gap-3 justify-center pt-2">
        {status === 409 ? (
          <Link href="/login">
            <Button>Giriş Yap</Button>
          </Link>
        ) : (
          <Link href="/demo-talep">
            <Button>
              Demo Talep Et
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        )}
        <Link href="/">
          <Button variant="secondary">Anasayfa</Button>
        </Link>
      </div>
    </div>
  );
}

export function BuyerRegisterForm({ invitationToken }: BuyerRegisterFormProps) {
  const [step, setStep] = useState<StepNo>(1);
  const [submittedEmail, setSubmittedEmail] = useState<string>("");

  const inviteQuery = useQuery({
    queryKey: ["buyer-invitation-info", invitationToken],
    queryFn: () => fetchBuyerInvitationInfo(invitationToken),
    retry: false,
  });

  const inviteData: BuyerInvitationInfo | undefined = inviteQuery.data;
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

  // Davet bilgisi gelince e-postayı forma yansıt
  useEffect(() => {
    if (inviteData?.email) {
      form.setValue("adminEmail", inviteData.email);
    }
  }, [inviteData?.email, form]);

  const submitMutation = useMutation({
    mutationFn: (values: FullRegistration) =>
      submitBuyerApplication(values, invitationToken),
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

  // Davet doğrulanırken: kart loading
  if (inviteQuery.isLoading) {
    return (
      <div className="card p-10 flex flex-col items-center justify-center text-center space-y-3">
        <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
        <p className="text-sm text-slate-500">Davet doğrulanıyor…</p>
      </div>
    );
  }

  // Davet hatalı (404/410/409): hata kartı, FORM AÇILMAZ
  if (inviteQuery.isError) {
    return <ErrorCard status={inviteStatusCode} />;
  }

  // Step 3: success
  if (step === 3) {
    return (
      <div className="card p-6 md:p-8">
        <StepSuccess email={submittedEmail} />
      </div>
    );
  }

  // Davet doğrulandı → banner + form
  return (
    <div className="space-y-5">
      <Stepper current={step} />

      {inviteData ? (
        <InvitationBanner
          type="demo"
          expiresAt={inviteData.expiresAt}
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
