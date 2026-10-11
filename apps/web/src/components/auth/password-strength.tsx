"use client";

import { isPasswordTooLong, passwordScore, usePasswordRules } from "@/lib/company-auth/password-rules";
import { Check, X } from "lucide-react";

/**
 * Şifre gücü çubuğu + kural listesi — kayıt, davet kabulü ve şifre sıfırlama
 * formlarının ORTAK parçası (sıfırlama sayfası kuralları eskiden yalnız kesik
 * bir yer tutucuda söylüyordu; arayüz testi 2026-10 login-3).
 *
 * Kurallar, puan ve etiket BURADA, tek kaynaktan (`password-rules.ts`) okunur;
 * formlar yalnız şifreyi verir. Eskiden her form puanı kendi hesaplayıp
 * veriyordu: üst sınırı (72 bayt) aşan şifre beş kuralı da karşıladığı için
 * çubuk dolu yeşil, etiket "Çok Güçlü" çıkıyordu — formun reddettiği şifreye
 * (arayüz testi 2026-10 relogin-1). Artık böyle şifrede puan bir eksik sayılır
 * (`passwordScore`) ve liste üst sınır satırını karşılanmamış olarak gösterir.
 *
 * Karşılanmayan kural `zinc-500` (beyazda 4,8:1): eski `zinc-400` 12 px
 * metinde 2,6:1 kalıyordu (arayüz testi 2026-10 signup-tr-20; CLAUDE.md "küçük
 * metinde zinc-400 kullanma"). Durum yalnız renkle değil simgeyle de (✓ / ✕)
 * ayrışır.
 *
 * Şifre boşken güç etiketi yazılmaz ("Çok Zayıf" henüz yazılmamış şifreye
 * söylenmez); kural listesi yine görünür — kullanıcı yazmadan önce okur.
 */
export function PasswordStrength({ password, live = false }: { password: string; live?: boolean }) {
  const { rules, strength, maxLabel } = usePasswordRules();
  const score = passwordScore(password);
  const tooLong = isPasswordTooLong(password);
  return (
    <div className="space-y-1.5" role={live ? "status" : undefined} aria-live={live ? "polite" : undefined}>
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
          <div
            className={`h-full transition-all ${
              score <= 2 ? "bg-red-500" : score < rules.length ? "bg-amber-500" : "bg-emerald-500"
            }`}
            style={{ width: `${(score / rules.length) * 100}%` }}
          />
        </div>
        {password ? <span className="text-xs font-medium text-zinc-600">{strength(score)}</span> : null}
      </div>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
        {rules.map((r) => {
          const ok = r.test(password);
          return (
            <li key={r.key} className={`flex items-center gap-1 text-xs ${ok ? "text-emerald-600" : "text-zinc-500"}`}>
              {ok ? <Check className="h-3 w-3" aria-hidden /> : <X className="h-3 w-3" aria-hidden />}
              {r.label}
            </li>
          );
        })}
        {/* Üst sınır yalnız AŞILDIĞINDA listeye girer (her zaman ✕): formun
            reddettiği şifrede liste "hepsi tamam" demez. */}
        {tooLong ? (
          <li className="flex items-center gap-1 text-xs text-red-600">
            <X className="h-3 w-3" aria-hidden />
            {maxLabel}
          </li>
        ) : null}
      </ul>
    </div>
  );
}
