"use client";

import { useEffect, useState } from "react";

/**
 * Supabase Auth e-posta doğrulama / davet callback'i.
 *
 * Akış:
 *  - type=signup: Tedarikçi self-register doğrulama → success ekranı.
 *  - type=invite: Alıcı davet → şifre belirleme form'u (reset-callback'e
 *    paralel akış).
 *
 * NOT: Backend endpoint'leri (Task #44) hazır olunca tamamlanır.
 */
export function VerifyCallbackForm() {
  const [type, setType] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.replace(/^#/, "");
    const params = new URLSearchParams(hash);
    const t = params.get("type");
    const token = params.get("access_token");
    if (!token || !t) {
      setErrorMsg("Geçersiz veya süresi geçmiş doğrulama linki");
      return;
    }
    setType(t);
  }, []);

  return (
    <div className="max-w-md mx-auto py-12 px-4">
      <h1 className="text-2xl font-bold text-brand-900 mb-4">
        E-posta Doğrulama
      </h1>
      {errorMsg ? (
        <p className="text-sm text-danger-700 bg-danger-50 border border-danger-200 rounded-lg p-3">
          {errorMsg}
        </p>
      ) : !type ? (
        <p className="text-sm text-slate-500">Doğrulanıyor…</p>
      ) : (
        <p className="text-sm text-slate-500">
          [İskelet — {type} flow'u backend hazır olunca eklenir]
        </p>
      )}
    </div>
  );
}
