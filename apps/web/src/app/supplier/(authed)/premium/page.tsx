"use client";

import { PageHeader } from "@/components/list";
import { useSupplierMe } from "@/hooks/use-supplier-auth";
import {
  Check,
  ChevronRight,
  Loader2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

const BENEFITS = [
  "Tüm herkese açık ihalelere davet beklemeden teklif",
  "Sınırsız alıcı bağlantısı",
  "Herkese açık firma profili",
  "Öne çıkan tedarikçi rozeti",
];

export default function SupplierPremiumPage() {
  const me = useSupplierMe();

  if (me.isLoading || !me.data) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  const isPremium = me.data.supplier.membership === "PREMIUM";
  const docsVerified =
    me.data.supplier.companyVerificationStatus === "VERIFIED";
  const docsStatus = me.data.supplier.companyVerificationStatus;
  const twoFa = me.data.supplierUser.twoFactorEnabled === true;
  const verified = docsVerified && twoFa;

  const docsHint =
    docsStatus === "PENDING"
      ? "Belgeleriniz inceleniyor"
      : docsStatus === "REJECTED"
        ? "Reddedildi — belgeleri güncelleyin"
        : "Belgeleri yükleyin";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Premium Üyelik"
        description="Premium ile tüm açık ihalelere erişin ve öne çıkın."
      />

      {/* Avantajlar */}
      <div className="rounded-2xl border border-zinc-950/10 bg-white p-6">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-amber-500" />
          <h2 className="text-base font-semibold text-zinc-900">
            Premium avantajları
          </h2>
        </div>
        <ul className="space-y-2">
          {BENEFITS.map((b) => (
            <li key={b} className="flex items-center gap-2 text-sm text-zinc-700">
              <Check className="h-4 w-4 shrink-0 text-success-600" />
              {b}
            </li>
          ))}
        </ul>
      </div>

      {isPremium ? (
        <div className="rounded-2xl border border-success-200 bg-success-50 p-6 text-center">
          <ShieldCheck className="mx-auto mb-2 h-8 w-8 text-success-600" />
          <p className="font-semibold text-success-800">
            Premium üyeliğiniz aktif
          </p>
          <p className="mt-1 text-sm text-success-700">
            Tüm premium özelliklerini kullanıyorsunuz.
          </p>
        </div>
      ) : verified ? (
        // Doğrulama tamam — ödeme/aktivasyon adımı (Faz 7).
        <div className="rounded-2xl border border-zinc-950/10 bg-white p-6 text-center">
          <ShieldCheck className="mx-auto mb-2 h-8 w-8 text-success-600" />
          <p className="font-semibold text-zinc-900">
            Doğrulamanız tamamlandı
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            Doğrulamanız tamamlandı. Premium'a geçiş için ödeme adımı yakında
            eklenecek.
          </p>
        </div>
      ) : (
        // Doğrulama kapısı — alıcının ihale kapısıyla aynı gereksinimler.
        <div className="rounded-2xl border border-zinc-950/10 bg-white p-6">
          <div className="mb-1 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-amber-600" />
            <h2 className="text-base font-semibold text-zinc-900">
              Premium için doğrulama gerekli
            </h2>
          </div>
          <p className="mb-4 text-sm text-zinc-500">
            Premium'a geçmeden önce şirket doğrulamanızı tamamlayın ve 2 adımlı
            doğrulamayı etkinleştirin.
          </p>
          <div className="space-y-3">
            <RequirementRow
              done={docsVerified}
              title="Şirket belgelerini doğrula"
              hint={docsVerified ? "Doğrulandı" : docsHint}
              href="/supplier/kurumsal-kimlik"
            />
            <RequirementRow
              done={twoFa}
              title="2 adımlı doğrulamayı etkinleştir"
              hint={twoFa ? "Aktif" : "E-posta tabanlı 2FA'yı açın"}
              href="/supplier/ayarlar/2fa-islemleri"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function RequirementRow({
  done,
  title,
  hint,
  href,
}: {
  done: boolean;
  title: string;
  hint: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl border border-zinc-950/10 p-4 transition-colors hover:bg-zinc-50"
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
          done ? "bg-success-100 text-success-700" : "bg-zinc-100 text-zinc-400"
        }`}
      >
        <ShieldCheck className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-zinc-900">{title}</p>
        <p className="text-xs text-zinc-500">{hint}</p>
      </div>
      {!done ? (
        <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-zinc-600">
          Aç <ChevronRight className="h-4 w-4" />
        </span>
      ) : null}
    </Link>
  );
}
