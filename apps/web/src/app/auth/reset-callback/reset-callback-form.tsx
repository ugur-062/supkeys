"use client";

import { useEffect, useState } from "react";

/**
 * Supabase password recovery callback.
 *
 * Akış:
 *  1. Kullanıcı e-postadaki "şifre sıfırla" linkine tıklar.
 *  2. Supabase access_token + refresh_token'ı URL hash'ine koyup buraya
 *     yönlendirir. (#access_token=...&refresh_token=...&type=recovery)
 *  3. Burada hash'i parse edip yeni şifre formu açarız.
 *  4. POST /api/auth/reset-callback → backend Supabase SDK'sıyla şifreyi
 *     günceller ve domain user'ın passwordHash'ini de senkronlar (bcrypt).
 *
 * NOT: Bu component şu an iskelet. Backend endpoint hazır olunca
 * tamamlanır (Task #44 — P2: Şifre reset + email verify callback).
 */
export function ResetCallbackForm() {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.replace(/^#/, "");
    const params = new URLSearchParams(hash);
    const token = params.get("access_token");
    const type = params.get("type");
    if (!token || type !== "recovery") {
      setErrorMsg("Geçersiz veya süresi geçmiş şifre sıfırlama linki");
      return;
    }
    setAccessToken(token);
  }, []);

  return (
    <div className="max-w-md mx-auto py-12 px-4">
      <h1 className="text-2xl font-bold text-brand-900 mb-4">
        Yeni Şifre Belirle
      </h1>
      {errorMsg ? (
        <p className="text-sm text-danger-700 bg-danger-50 border border-danger-200 rounded-lg p-3">
          {errorMsg}
        </p>
      ) : !accessToken ? (
        <p className="text-sm text-slate-500">Doğrulanıyor…</p>
      ) : (
        <p className="text-sm text-slate-500">
          [İskelet — yeni şifre form'u backend hazır olunca eklenir]
        </p>
      )}
    </div>
  );
}
