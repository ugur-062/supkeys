"use client";

import { Button } from "@/components/ui/button";
import {
  verifyEmail,
  type RegistrationKind,
  type VerifyEmailResponse,
} from "@/lib/registration/api";
import axios from "axios";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

interface VerifyEmailClientProps {
  token: string;
  type: "" | RegistrationKind;
}

type VerifyState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; data: VerifyEmailResponse }
  | {
      kind: "error";
      status?: number;
      title: string;
      description: string;
    };

export function VerifyEmailClient({ token, type }: VerifyEmailClientProps) {
  const [state, setState] = useState<VerifyState>({ kind: "idle" });
  const fired = useRef(false);

  useEffect(() => {
    // StrictMode + Next 15 dev double-effect guard
    if (fired.current) return;
    fired.current = true;

    if (!token || !type) {
      setState({
        kind: "error",
        title: "Geçersiz link",
        description:
          "Doğrulama bağlantısı eksik. Lütfen e-postanızdaki linki kopyalayıp yeniden açın.",
      });
      return;
    }

    setState({ kind: "loading" });

    verifyEmail(token, type)
      .then((data) => setState({ kind: "success", data }))
      .catch((err) => {
        const status = axios.isAxiosError(err)
          ? err.response?.status
          : undefined;
        if (status === 410) {
          setState({
            kind: "error",
            status,
            title: "Doğrulama linkinin süresi dolmuş",
            description:
              "Bağlantı 24 saatten daha eski. Lütfen yeniden başvuru yapın.",
          });
          return;
        }
        if (status === 409) {
          setState({
            kind: "error",
            status,
            title: "Bu e-posta zaten doğrulanmış",
            description:
              "Hesabınız varsa giriş yapabilirsiniz; yoksa ekibimizin onayını bekleyin.",
          });
          return;
        }
        if (status === 404) {
          setState({
            kind: "error",
            status,
            title: "Doğrulama linki geçersiz",
            description:
              "Bağlantı yanlış ya da kullanılmış olabilir. Yeniden başvurabilirsiniz.",
          });
          return;
        }
        setState({
          kind: "error",
          title: "Bir sorun oluştu",
          description: "Lütfen birkaç dakika sonra tekrar deneyin.",
        });
      });
  }, [token, type]);

  return (
    <div className="card p-8 md:p-10 text-center space-y-5 max-w-xl mx-auto">
      {state.kind === "idle" || state.kind === "loading" ? (
        <>
          <div className="w-16 h-16 rounded-full bg-brand-50 flex items-center justify-center mx-auto">
            <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
          </div>
          <div className="space-y-2">
            <h1 className="font-display font-bold text-2xl text-brand-900">
              E-posta adresiniz doğrulanıyor…
            </h1>
            <p className="text-slate-600 text-sm">Bu birkaç saniye sürer.</p>
          </div>
        </>
      ) : null}

      {state.kind === "success" ? (
        <>
          <div className="w-16 h-16 rounded-full bg-success-50 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-9 h-9 text-success-600" />
          </div>
          <div className="space-y-2">
            <h1 className="font-display font-bold text-2xl text-brand-900">
              E-posta doğrulandı 🎉
            </h1>
            <p className="text-slate-600">
              Başvurunuz incelemeye alındı, en kısa sürede dönüş yapacağız.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 justify-center pt-2">
            <Link href="/">
              <Button variant="secondary">Anasayfaya Dön</Button>
            </Link>
          </div>
        </>
      ) : null}

      {state.kind === "error" ? (
        <>
          <div
            className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto ${
              state.status === 410
                ? "bg-warning-50"
                : state.status === 409
                  ? "bg-brand-50"
                  : "bg-danger-50"
            }`}
          >
            {state.status === 410 ? (
              <AlertTriangle className="w-9 h-9 text-warning-600" />
            ) : state.status === 409 ? (
              <Info className="w-9 h-9 text-brand-600" />
            ) : (
              <XCircle className="w-9 h-9 text-danger-600" />
            )}
          </div>
          <div className="space-y-2">
            <h1 className="font-display font-bold text-2xl text-brand-900">
              {state.title}
            </h1>
            <p className="text-slate-600">{state.description}</p>
          </div>
          <div className="flex flex-wrap gap-3 justify-center pt-2">
            {state.status === 410 ? (
              <Link
                href={
                  type === "supplier" ? "/register/supplier" : "/register/buyer"
                }
              >
                <Button>Yeniden Başvur</Button>
              </Link>
            ) : null}
            {state.status === 409 ? (
              <Link href="/login">
                <Button>Giriş Yap</Button>
              </Link>
            ) : null}
            <Link href="/">
              <Button variant="secondary">Anasayfa</Button>
            </Link>
          </div>
        </>
      ) : null}
    </div>
  );
}
