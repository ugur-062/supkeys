// @vitest-environment jsdom
/**
 * AYARLAR › Adres Defteri ve Banka Hesapları — liste durumları (canlı doğrulama
 * 2026-10-09 taraması, LİSTE DURUMLARI).
 *
 * GERÇEK `useAddresses` / `useBankAccounts` kancaları + gerçek QueryClient;
 * yalnız `companyApi` sahte. İki bölüm de `isLoading ? … : isError ? … : boş`
 * diye dallanıyordu: çevrimdışı duraklayan sorguda (`isLoading` false, veri yok)
 * "Henüz kayıtlı … yok" çiziliyor; verisi olan listede arka plan yenilemesi
 * düşünce de satırlar "… yüklenemedi"ye dönüyordu.
 */
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ get: vi.fn<(url: string) => Promise<{ data: unknown }>>() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/components/providers/confirm-dialog", () => ({ useConfirm: () => async () => true }));
vi.mock("@/lib/company-auth/api", () => ({
  companyApi: { get: h.get, post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

import { AddressBookSection } from "../address-book-section";
import { BankAccountsSection } from "../bank-accounts-section";

const networkError = Object.assign(new Error("Network Error"), { isAxiosError: true });

const address = {
  id: "a1",
  type: "TESLIMAT",
  title: "Merkez Depo",
  contactName: "Ada",
  phone: null,
  country: "TR",
  city: "İstanbul",
  district: "Kadıköy",
  addressLine: "Örnek Sk. No 1",
  postalCode: null,
  taxOffice: null,
  taxNumber: null,
  isDefault: false,
};
const account = {
  id: "b1",
  title: "TL Vadesiz",
  accountHolder: "Demo A.Ş.",
  iban: "TR330006100519786457841326",
  bankName: "İş Bankası",
  isDefault: true,
};

const CASES = [
  {
    name: "Adres Defteri",
    ui: <AddressBookSection canManage />,
    key: ["company-addresses"],
    rows: [address],
    rowText: "Merkez Depo",
    emptyText: /Henüz kayıtlı adres yok/,
    errorText: "Adresler yüklenemedi.",
  },
  {
    name: "Banka Hesapları",
    ui: <BankAccountsSection canManage />,
    key: ["company-bank-accounts"],
    rows: [account],
    rowText: "TL Vadesiz",
    emptyText: /Henüz kayıtlı banka hesabı yok/,
    errorText: "Banka hesapları yüklenemedi.",
  },
] as const;

let client: QueryClient;
const mount = (ui: React.ReactElement) => render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);

beforeEach(() => {
  h.get.mockReset();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
  onlineManager.setOnline(true);
  client.clear();
});

describe.each(CASES)("$name — liste durumları", ({ ui, key, rows, rowText, emptyText, errorText }) => {
  it("çevrimdışı duraklayan sorgu (istek yok, hata yok, veri yok): 'yükleniyor', 'henüz yok' değil", async () => {
    onlineManager.setOnline(false);
    h.get.mockRejectedValue(networkError);
    mount(ui);
    await act(async () => {});
    expect(h.get).not.toHaveBeenCalled();
    expect(screen.getByText("Yükleniyor…")).toBeInTheDocument();
    expect(screen.queryByText(emptyText)).toBeNull();
    expect(screen.queryByText(errorText)).toBeNull();
  });

  it("kesinti: hata + Yeniden dene; 'henüz yok' değil", async () => {
    h.get.mockRejectedValue(networkError);
    mount(ui);
    expect(await screen.findByText(errorText)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Yeniden dene" })).toBeInTheDocument();
    expect(screen.queryByText(emptyText)).toBeNull();
  });

  it("arka plan yenilemesi düşünce ekrandaki satırlar kalır", async () => {
    h.get.mockResolvedValue({ data: rows });
    mount(ui);
    expect(await screen.findByText(rowText)).toBeInTheDocument();

    h.get.mockRejectedValue(networkError);
    await act(async () => {
      await client.refetchQueries({ queryKey: [...key] });
    });
    await waitFor(() => expect(client.getQueryState([...key])?.status).toBe("error"));

    expect(screen.queryByText(errorText)).toBeNull();
    expect(screen.getByText(rowText)).toBeInTheDocument();
  });

  it("başarılı ve BOŞ yanıt boş durumu çizer (boş durum yalnız buradan)", async () => {
    h.get.mockResolvedValue({ data: [] });
    mount(ui);
    expect(await screen.findByText(emptyText)).toBeInTheDocument();
  });
});
