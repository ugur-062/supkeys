// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  mutate: vi.fn(),
  push: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: h.push }),
}));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/hooks/use-admin-auth", () => ({
  useAdminLogin: () => ({ mutate: h.mutate, isPending: false }),
}));

import { AdminLoginForm } from "../login-form";

async function submit(user: ReturnType<typeof userEvent.setup>) {
  // Zorunlu alan etiketleri görsel "*" taşır (aria-hidden); getByLabelText ham
  // textContent'e bakar → substring eşleşme (exact:false). "Şifre" ayrıca
  // göster/gizle butonunun aria-label'ında geçtiği için selector:"input" ile
  // form kontrolüne kısıtla.
  await user.type(
    screen.getByLabelText("E-posta", { exact: false, selector: "input" }),
    "admin@rothern.com",
  );
  await user.type(
    screen.getByLabelText("Şifre", { exact: false, selector: "input" }),
    "admin12345",
  );
  await user.click(screen.getByRole("button", { name: "Giriş Yap" }));
}

function axiosError(message: string) {
  return new AxiosError("hata", "ERR_BAD_REQUEST", undefined, undefined, {
    status: 401,
    data: { message },
    statusText: "Unauthorized",
    headers: {},
    config: {} as never,
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AdminLoginForm", () => {
  it("başarılı giriş → mutate çağrılır, toast.success + /admin/dashboard'a yönlenir", async () => {
    const user = userEvent.setup();
    h.mutate.mockImplementation((_values, opts) =>
      opts.onSuccess({ admin: { firstName: "Ada" } }),
    );
    render(<AdminLoginForm />);
    await submit(user);

    expect(h.mutate).toHaveBeenCalledWith(
      { email: "admin@rothern.com", password: "admin12345" },
      expect.anything(),
    );
    expect(h.toast.success).toHaveBeenCalledWith("Hoş geldin, Ada!");
    expect(h.push).toHaveBeenCalledWith("/admin/dashboard");
  });

  it("axios hatası → sunucu mesajıyla toast.error, yönlendirme yok", async () => {
    const user = userEvent.setup();
    h.mutate.mockImplementation((_values, opts) =>
      opts.onError(axiosError("Geçersiz kimlik bilgileri")),
    );
    render(<AdminLoginForm />);
    await submit(user);

    expect(h.toast.error).toHaveBeenCalledWith("Geçersiz kimlik bilgileri");
    expect(h.push).not.toHaveBeenCalled();
  });

  it("geçersiz e-posta → inline zod hatası, mutate çağrılmaz", async () => {
    const user = userEvent.setup();
    render(<AdminLoginForm />);
    await user.type(
      screen.getByLabelText("E-posta", { exact: false, selector: "input" }),
      "gecersiz",
    );
    await user.type(
      screen.getByLabelText("Şifre", { exact: false, selector: "input" }),
      "x",
    );
    await user.click(screen.getByRole("button", { name: "Giriş Yap" }));

    expect(
      await screen.findByText("Geçerli bir e-posta giriniz"),
    ).toBeInTheDocument();
    expect(h.mutate).not.toHaveBeenCalled();
  });
});
