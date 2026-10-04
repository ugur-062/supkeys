// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  acceptAsync: vi.fn(),
  setAuth: vi.fn(),
  replace: vi.fn(),
  storeUser: null as { id: string; email: string } | null,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: h.replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => "/company/davet/tok",
}));
vi.mock("@/lib/company-auth/store", () => ({
  useCompanyAuthStore: (sel: (s: unknown) => unknown) => sel({ user: h.storeUser, isHydrated: true }),
}));
vi.mock("@/hooks/use-company-auth", () => ({
  useInvitationPreview: () => ({
    data: { email: "yeni@firma.com", roles: ["SATISCI"], companyName: "Örnek AŞ", expiresAt: "2026-12-01" },
    isLoading: false,
    error: null,
  }),
  useAcceptInvitation: () => ({ mutateAsync: h.acceptAsync, isPending: false }),
  useSetCompanyAuth: () => h.setAuth,
}));

import { AcceptInviteClient } from "../accept-invite-client";

/**
 * Kurulum alanını TEK `paste` olayıyla doldurur (son toparlama 2026-10-04).
 * Karakter karakter `user.type` her tuşta tüm formu (telefon/ülke seçicisi
 * dahil) yeniden çizdiriyordu; tam suite paralel koşarken bu kurulum adımları
 * testleri 15 sn zaman aşımına itiyordu. Tuş-tuş davranışı sınanan alanlar
 * (telefon, IBAN, kod…) testin kendisinde `user.type` ile kalır.
 */
async function fill(user: ReturnType<typeof userEvent.setup>, el: HTMLElement, text: string) {
  await user.click(el);
  await user.paste(text);
}

async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
  await fill(user, screen.getByLabelText("Ad"), "Ada");
  await fill(user, screen.getByLabelText("Soyad", { exact: true }), "Yılmaz");
  await fill(user, screen.getByLabelText("Şifre", { exact: true }), "Guclu!Parola9");
  await fill(user, screen.getByLabelText(/Şifre \(/), "Guclu!Parola9");
  await user.click(screen.getByRole("checkbox", { name: "Kullanıcı sözleşmesini okudum ve kabul ediyorum" }));
  await user.click(screen.getByRole("checkbox", { name: "Platform aracılık ve kullanım sözleşmesini kabul ediyorum" }));
  await user.click(screen.getByRole("checkbox", { name: /^KVKK Aydınlatma Metni/ }));
}

beforeEach(() => {
  vi.clearAllMocks();
  h.storeUser = null;
});

describe("AcceptInviteClient", () => {
  // Arayüz testi O-121: eksik numara kaydediliyordu (istemci kontrolü yoktu).
  it("eksik telefon: satır içi uyarı + gönder kapalı; boş telefon serbest", async () => {
    const user = userEvent.setup();
    render(<AcceptInviteClient token="tok" />);
    await fillRequired(user);
    const submit = screen.getByRole("button", { name: "Daveti Kabul Et ve Katıl" });
    expect(submit).toBeEnabled();
    const phone = screen.getByPlaceholderText("5XX XXX XX XX");
    await user.type(phone, "532123");
    await user.tab();
    expect(screen.getByText(/geçerli bir telefon numarası girin/)).toBeInTheDocument();
    expect(submit).toBeDisabled();
    await user.clear(phone);
    await user.type(phone, "5321234567");
    expect(screen.queryByText(/geçerli bir telefon numarası girin/)).toBeNull();
    expect(submit).toBeEnabled();
  });

  // Arayüz testi D-348: başka hesapla oturum açıkken uyarı.
  it("başka hesapla oturum açıkken kabulün oturumu değiştireceğini söyler", () => {
    h.storeUser = { id: "u9", email: "eski@baska.com" };
    render(<AcceptInviteClient token="tok" />);
    expect(screen.getByRole("status")).toHaveTextContent(/eski@baska\.com/);
    expect(screen.getByRole("status")).toHaveTextContent(/yeni@firma\.com/);
  });

  it("oturum yoksa uyarı yok", () => {
    render(<AcceptInviteClient token="tok" />);
    expect(screen.queryByText(/olarak oturum açık/)).toBeNull();
  });
});
