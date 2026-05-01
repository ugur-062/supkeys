"use client";

import { Button } from "@/components/ui/button";
import { CheckCircle2, Mail } from "lucide-react";
import Link from "next/link";

interface StepSuccessProps {
  email: string;
}

export function StepSuccess({ email }: StepSuccessProps) {
  return (
    <div className="text-center space-y-5">
      <div className="w-20 h-20 rounded-full bg-success-50 flex items-center justify-center mx-auto">
        <CheckCircle2 className="w-10 h-10 text-success-600" />
      </div>

      <div className="space-y-2">
        <h2 className="text-2xl font-display font-bold text-brand-900">
          Başvurunuz alındı 🎉
        </h2>
        <p className="text-slate-600">
          Devam etmek için e-postanızı doğrulamanız gerekiyor.
        </p>
      </div>

      <div className="rounded-xl bg-brand-50 border-l-4 border-brand-600 p-4 text-left">
        <div className="flex items-start gap-3">
          <Mail className="w-5 h-5 text-brand-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-1.5 text-sm">
            <p className="text-brand-900 font-medium">
              <span className="font-semibold">{email}</span> adresine doğrulama
              linki gönderdik.
            </p>
            <p className="text-slate-700 leading-relaxed">
              Linki tıkladıktan sonra ekibimiz başvurunuzu inceleyecek. Onay
              sonrası giriş yapabileceksiniz.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center gap-2 pt-2">
        <button
          type="button"
          disabled
          className="text-sm text-slate-400 cursor-not-allowed"
          title="Yakında aktif olacak"
        >
          E-postayı tekrar gönder (60sn sonra…)
        </button>
        <Link href="/">
          <Button variant="secondary" size="md">
            Anasayfaya Dön
          </Button>
        </Link>
      </div>
    </div>
  );
}
