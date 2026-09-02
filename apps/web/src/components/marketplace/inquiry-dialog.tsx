"use client";

import { resolveApiBaseUrl } from "@/lib/resolve-api-url";
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { CheckCircleIcon, XMarkIcon } from "@heroicons/react/20/solid";
import { useEffect, useRef, useState } from "react";

/**
 * MİSAFİR BİLGİ TALEBİ KUTUSU — hesap SORMAZ.
 *
 * Europages modeli: ziyaretçi değerli işi (mesajı yazmayı) ÖNCE yapar, hesap
 * sonra istenir. Kayıt isteğe bağlı değil, ERTELENMİŞ — yanıtı okumak için
 * gerekiyor. Kullanıcı o noktada zaten emek vermiş olur.
 *
 * İki bot savunması burada:
 *   · `website` alanı GİZLİ tuzak — insan doldurmaz,
 *   · form açılışından gönderime geçen süre ölçülür (bot 2 sn'den hızlı).
 * İkisi de sunucuda sessizce yutulur; kullanıcıya başarı görünür.
 *
 * `companyApi` KULLANILMAZ: bu uç anonim ve CSRF çerezi yok. Düz `fetch`.
 */
export function InquiryDialog({
  open,
  onClose,
  companySlug,
  productSlug,
  productName,
  companyName,
}: {
  open: boolean;
  onClose: () => void;
  companySlug: string;
  productSlug: string;
  productName: string;
  companyName: string;
}) {
  const openedAt = useRef<number>(Date.now());
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      openedAt.current = Date.now();
      setSent(false);
      setError(null);
    }
  }, [open]);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch(`${resolveApiBaseUrl()}/public/inquiries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companySlug,
          productSlug,
          name: fd.get("name"),
          email: fd.get("email"),
          companyName: fd.get("companyName") || undefined,
          phone: fd.get("phone") || undefined,
          quantity: fd.get("quantity") || undefined,
          message: fd.get("message"),
          website: fd.get("website") || undefined, // tuzak
          elapsedMs: Date.now() - openedAt.current,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { message?: string }
          | null;
        throw new Error(body?.message ?? "Talep gönderilemedi");
      }
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Talep gönderilemedi");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-zinc-950/40" aria-hidden />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
          <div className="flex items-start justify-between gap-4">
            <DialogTitle className="text-lg font-semibold tracking-tight text-zinc-950">
              {sent ? "E-postanızı kontrol edin" : "Teklif iste"}
            </DialogTitle>
            <button
              type="button"
              onClick={onClose}
              className="-m-1 rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
              aria-label="Kapat"
            >
              <XMarkIcon aria-hidden className="size-5" />
            </button>
          </div>

          {sent ? (
            <div className="mt-6">
              <p className="flex items-start gap-2 rounded-xl bg-emerald-50 p-4 text-sm/6 text-emerald-900 ring-1 ring-emerald-600/20">
                <CheckCircleIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span>
                  Talebiniz <strong>henüz gönderilmedi.</strong> E-postanıza
                  gelen bağlantıya tıklayın; talebiniz o an{" "}
                  {companyName} firmasına iletilecek.
                </span>
              </p>
              <p className="mt-4 text-xs/5 text-zinc-500">
                Bu adım, adresinizin gerçek olduğunu doğruluyor — satıcılara
                sahte talep gitmesini böyle engelliyoruz.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-6 w-full rounded-full bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800"
              >
                Tamam
              </button>
            </div>
          ) : (
            <form onSubmit={(e) => void submit(e)} className="mt-5 space-y-4">
              <p className="text-sm/6 text-zinc-500">
                <strong className="text-zinc-900">{productName}</strong> hakkında{" "}
                {companyName} firmasına soru gönderin. Hesap gerekmez.
              </p>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input name="name" label="Ad soyad" required maxLength={100} />
                <Input
                  name="email"
                  type="email"
                  label="E-posta"
                  required
                  maxLength={200}
                />
                <Input name="companyName" label="Firma adı" maxLength={150} />
                <Input name="phone" label="Telefon" maxLength={40} />
              </div>

              <Input
                name="quantity"
                label="Miktar"
                placeholder="örn. 500 adet"
                maxLength={100}
              />

              <div>
                <label
                  htmlFor="inq-message"
                  className="block text-sm font-medium text-zinc-900"
                >
                  Mesajınız <span className="text-zinc-400">*</span>
                </label>
                <textarea
                  id="inq-message"
                  name="message"
                  required
                  minLength={10}
                  maxLength={3000}
                  rows={4}
                  placeholder="İhtiyacınızı, teslim yerini ve termini yazın."
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
                />
              </div>

              {/* Bot tuzağı — ekran okuyucudan ve gözden gizli. */}
              <div aria-hidden className="hidden">
                <label htmlFor="inq-website">Web sitesi</label>
                <input id="inq-website" name="website" tabIndex={-1} autoComplete="off" />
              </div>

              {error ? (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-600/20">
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-full bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-50"
              >
                {busy ? "Gönderiliyor…" : "Talebi gönder"}
              </button>
              <p className="text-center text-xs text-zinc-500">
                Yanıtı okumak için ücretsiz hesap gerekir.
              </p>
            </form>
          )}
        </DialogPanel>
      </div>
    </Dialog>
  );
}

function Input({
  name,
  label,
  type = "text",
  required,
  maxLength,
  placeholder,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  maxLength?: number;
  placeholder?: string;
}) {
  return (
    <div>
      <label
        htmlFor={`inq-${name}`}
        className="block text-sm font-medium text-zinc-900"
      >
        {label}
        {required ? <span className="ml-0.5 text-zinc-400">*</span> : null}
      </label>
      <input
        id={`inq-${name}`}
        name={name}
        type={type}
        required={required}
        maxLength={maxLength}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
      />
    </div>
  );
}
