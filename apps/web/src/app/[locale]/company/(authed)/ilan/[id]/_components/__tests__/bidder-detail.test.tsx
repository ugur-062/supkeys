// @vitest-environment jsdom
import type { ListingDetail } from "@/hooks/use-company-listings";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render as rtlRender, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import { AuctionLiveCard } from "../auction-live-card";
import { BidSummaryCard, MyBidStatusPanel } from "../my-bid-status-panel";

// BidSummaryCard geçerlilik-uzatma mutation'ı kullanır → QueryClient şart.
const render = (ui: React.ReactElement) =>
  rtlRender(
    <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>,
  );

function detail(over: Partial<ListingDetail> = {}): ListingDetail {
  return {
    id: "l1",
    number: "ROT-2026-0001",
    type: "ALIM",
    title: "Çelik Alımı",
    status: "OPEN",
    primaryCurrency: "TRY",
    closesAt: new Date(Date.now() + 3 * 3600_000).toISOString(),
    items: [
      {
        id: "i1",
        name: "Çelik Boru",
        quantity: "10",
        unit: "adet",
      },
    ],
    ...over,
  } as ListingDetail;
}

describe("AuctionLiveCard", () => {
  const english = {
    isEnglishAuction: true as const,
    currentBest: "900",
    bidCount: 3,
    currentRound: 2,
  };

  it("4 kutu: teklifim + en iyi + sıra + tur hakkı", () => {
    render(
      <AuctionLiveCard
        l={detail({
          english,
          auctionView: {
            bestTotal: "900",
            myRank: 2,
            participantCount: 5,
            allBids: null,
          },
          myBid: { amount: "1000", status: "SUBMITTED", version: 2, note: null },
          nextBidConstraint: {
            direction: "DOWN",
            currencyLocked: true,
            ownCurrency: "TRY",
            ownLastTotal: "1000",
            canBidThisRound: true,
          },
          bidVisibility: "BEST_AND_OWN_RANK",
        })}
      />,
    );
    expect(screen.getByText(/Tur 2/)).toBeInTheDocument();
    expect(screen.getByText("Teklifiniz")).toBeInTheDocument();
    expect(screen.getByText("1.000 ₺")).toBeInTheDocument();
    expect(screen.getByText("900 ₺")).toBeInTheDocument();
    expect(screen.getByText("2 / 5")).toBeInTheDocument();
    expect(screen.getByText("Tur Hakkınız")).toBeInTheDocument();
    expect(screen.getByText("1 teklif")).toBeInTheDocument();
    expect(
      screen.getByText("En iyi teklif + kendi sıranız görünür"),
    ).toBeInTheDocument();
  });

  it("tur hakkı kullanıldıysa 'Kullanıldı' gösterilir", () => {
    render(
      <AuctionLiveCard
        l={detail({
          english,
          auctionView: null,
          bidVisibility: "OWN_ONLY",
          myBid: { amount: "1000", status: "SUBMITTED", version: 2, note: null },
          nextBidConstraint: {
            direction: "DOWN",
            currencyLocked: true,
            ownCurrency: "TRY",
            ownLastTotal: "1000",
            canBidThisRound: false,
          },
        })}
      />,
    );
    expect(screen.getByText("Kullanıldı")).toBeInTheDocument();
    // Yeni tur garanti değil — copy söz vermeden anlatır.
    expect(
      screen.getByText(/yeni tur açarsa güncelleyebilirsin/),
    ).toBeInTheDocument();
  });

  it("kapanmış pazarlıkta (sunucu kısıtı null) tur hakkı '—' + 'Teklif alımı kapandı' (derin denetim LU-20)", () => {
    render(
      <AuctionLiveCard
        l={detail({
          status: "IN_AWARD",
          english,
          auctionView: null,
          bidVisibility: "OWN_ONLY",
          myBid: { amount: "1000", status: "SUBMITTED", version: 2, note: null },
          nextBidConstraint: null,
        })}
      />,
    );
    expect(screen.getByText("Teklif alımı kapandı")).toBeInTheDocument();
    expect(screen.queryByText("1 teklif")).not.toBeInTheDocument();
    expect(screen.queryByText("Öncekinden düşük olmalı")).not.toBeInTheDocument();
  });

  it("OWN_ONLY: rakip bilgileri 'Gizli'", () => {
    render(
      <AuctionLiveCard
        l={detail({
          english,
          auctionView: null,
          bidVisibility: "OWN_ONLY",
        })}
      />,
    );
    expect(screen.getAllByText("Gizli").length).toBe(2); // en iyi + sıra
  });

  it("ALL modunda anonim sıralama listesi + kendi satırı işaretli", () => {
    render(
      <AuctionLiveCard
        l={detail({
          english,
          auctionView: {
            bestTotal: "900",
            myRank: 2,
            participantCount: 2,
            allBids: [
              { rank: 1, total: "900", isMine: false },
              { rank: 2, total: "1000", isMine: true },
            ],
          },
        })}
      />,
    );
    expect(screen.getByText("Tüm teklifler (anonim)")).toBeInTheDocument();
    expect(screen.getByText("#2 (Siz)")).toBeInTheDocument();
    expect(screen.getByText("#1 Tedarikçi")).toBeInTheDocument();
  });

  it("oto-uzatma notu gösterilir; english yoksa render edilmez", () => {
    const { unmount } = render(
      <AuctionLiveCard
        l={detail({
          english,
          autoExtendOnLateBid: true,
          autoExtendThresholdMin: 10,
          autoExtendByMinutes: 5,
        })}
      />,
    );
    expect(screen.getByText(/Son 10 dk içinde gelen teklif/)).toBeInTheDocument();
    unmount();

    const { container } = render(<AuctionLiveCard l={detail()} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("MyBidStatusPanel — durum makinesi", () => {
  it("WON → tebrik + sipariş linki", () => {
    render(
      <MyBidStatusPanel
        l={detail({
          status: "AWARDED",
          myBid: { amount: "1000", status: "WON", version: 1, note: null },
        })}
      />,
    );
    expect(screen.getByText(/teklifin kazandı/)).toBeInTheDocument();
    expect(
      // ALIM ihalesini kazanan teklifçi SATICI'dır → linki "Satışlarım"a gider.
      screen.getByRole("link", { name: "Satışlarımı Görüntüle" }),
    ).toBeInTheDocument();
  });

  it("LOST + açık satın alma talebi → eleme gerekçesi + yeniden teklif mesajı", () => {
    render(
      <MyBidStatusPanel
        l={detail({
          status: "OPEN",
          myBid: {
            amount: "1000",
            status: "LOST",
            version: 1,
            note: null,
            eliminationReason: "Fiyat yüksek",
          },
        })}
      />,
    );
    expect(screen.getByText(/bu turda elendi/)).toBeInTheDocument();
    expect(screen.getByText("Fiyat yüksek")).toBeInTheDocument();
    expect(screen.getByText(/yeniden verebilirsiniz/)).toBeInTheDocument();
  });

  it("LOST + değerlendirmede (IN_AWARD) elenen → 'elendi' + gerekçe, 'sonuçlandı' denmez (derin denetim LU-21)", () => {
    render(
      <MyBidStatusPanel
        l={detail({
          status: "IN_AWARD",
          myBid: {
            amount: "1000",
            status: "LOST",
            version: 1,
            note: null,
            eliminationReason: "Teknik şartname uyumsuz",
            eliminatedAt: new Date().toISOString(),
          },
        })}
      />,
    );
    expect(screen.getByText("Teklifiniz elendi")).toBeInTheDocument();
    expect(screen.getByText("Teknik şartname uyumsuz")).toBeInTheDocument();
    expect(screen.getByText(/henüz sonuçlanmadı/)).toBeInTheDocument();
    expect(screen.queryByText(/sonuçlandı —/)).not.toBeInTheDocument();
  });

  it("LOST + sonuçlanmış (AWARDED), kazandırmayla kaybeden → 'sonuçlandı', gerekçe yok", () => {
    render(
      <MyBidStatusPanel
        l={detail({
          status: "AWARDED",
          myBid: { amount: "1000", status: "LOST", version: 1, note: null },
        })}
      />,
    );
    expect(screen.getByText(/Alım talebi sonuçlandı/)).toBeInTheDocument();
  });

  it("SUBMITTED + açık → 'Teklifiniz alındı' (versiyon v1 gösterilmez)", () => {
    render(
      <MyBidStatusPanel
        l={detail({
          myBid: {
            amount: "1000",
            status: "SUBMITTED",
            version: 1,
            note: null,
            submittedAt: new Date().toISOString(),
          },
        })}
      />,
    );
    expect(screen.getByText("Teklifiniz alındı.")).toBeInTheDocument();
    expect(screen.getByText(/Verildi/)).toBeInTheDocument();
    // v1 gürültüsü kaldırıldı — versiyon yazısı hiçbir yerde yok.
    expect(screen.queryByText(/Versiyon/)).not.toBeInTheDocument();
  });

  it("DRAFT → taslak uyarısı; teklifsiz kapanmış → bilgi", () => {
    const { unmount } = render(
      <MyBidStatusPanel
        l={detail({
          myBid: { amount: "500", status: "DRAFT", version: 1, note: null },
        })}
      />,
    );
    expect(screen.getByText(/Taslak teklifiniz var/)).toBeInTheDocument();
    unmount();

    render(<MyBidStatusPanel l={detail({ status: "AWARDED", myBid: null })} />);
    expect(
      screen.getByText("Bu alım talebine teklif vermediniz."),
    ).toBeInTheDocument();
  });
});

describe("BidSummaryCard", () => {
  afterEach(() => {
    useCompanyAuthStore.setState({ user: null } as never);
  });

  const submittedBid = {
    amount: "1500",
    status: "SUBMITTED" as const,
    version: 1,
    note: null,
    currency: "TRY",
    submittedAt: new Date(Date.now() - 86_400_000).toISOString(),
    validityDays: 30,
    items: [{ itemId: "i1", unitPrice: "150" }],
  };

  it("'Geçerliliği Uzat': sell:bid:submit izniyle IN_AWARD'da görünür (derin denetim LU-20)", () => {
    useCompanyAuthStore.setState({
      user: { isOwner: false, roles: ["SATISCI"], permissions: ["sell:view", "sell:bid:submit"] },
    } as never);
    render(<BidSummaryCard l={detail({ status: "IN_AWARD", myBid: submittedBid })} />);
    expect(screen.getByRole("button", { name: "Geçerliliği Uzat" })).toBeInTheDocument();
  });

  it("'Geçerliliği Uzat': CLOSED (yönetici moderasyonu) talepte çizilmez", () => {
    useCompanyAuthStore.setState({
      user: { isOwner: false, roles: ["SATISCI"], permissions: ["sell:view", "sell:bid:submit"] },
    } as never);
    render(<BidSummaryCard l={detail({ status: "CLOSED", myBid: submittedBid })} />);
    expect(screen.queryByRole("button", { name: "Geçerliliği Uzat" })).not.toBeInTheDocument();
  });

  it("'Geçerliliği Uzat': SATISCI etiketi olup teklif izni olmayan üyeye çizilmez", () => {
    useCompanyAuthStore.setState({
      user: { isOwner: false, roles: ["SATISCI"], permissions: ["sell:view", "sell:product:manage"] },
    } as never);
    render(<BidSummaryCard l={detail({ status: "IN_AWARD", myBid: submittedBid })} />);
    expect(screen.queryByRole("button", { name: "Geçerliliği Uzat" })).not.toBeInTheDocument();
  });

  it("'Geçerliliği Uzat': TASLAK teklif yalnız teklif alımı açıkken (IN_AWARD ve embargoda çizilmez — derin denetim LU-15)", () => {
    useCompanyAuthStore.setState({
      user: { isOwner: false, roles: ["SATISCI"], permissions: ["sell:view", "sell:bid:submit"] },
    } as never);
    const draftBid = { ...submittedBid, status: "DRAFT" as const };
    const { unmount } = render(
      <BidSummaryCard l={detail({ status: "IN_AWARD", myBid: draftBid })} />,
    );
    expect(screen.queryByRole("button", { name: "Geçerliliği Uzat" })).not.toBeInTheDocument();
    unmount();
    const embargo = render(
      <BidSummaryCard
        l={detail({
          status: "OPEN",
          bidsOpenAt: new Date(Date.now() + 3600_000).toISOString(),
          myBid: draftBid,
        })}
      />,
    );
    expect(screen.queryByRole("button", { name: "Geçerliliği Uzat" })).not.toBeInTheDocument();
    embargo.unmount();
    render(<BidSummaryCard l={detail({ status: "OPEN", myBid: draftBid })} />);
    expect(screen.getByRole("button", { name: "Geçerliliği Uzat" })).toBeInTheDocument();
  });

  it("'Geçerliliği Uzat': TASLAK canlandırma teklif hakkı ve KYC kuralına uyar (arayüz testi O-071/O-072)", () => {
    useCompanyAuthStore.setState({
      user: { isOwner: false, roles: ["SATISCI"], permissions: ["sell:view", "sell:bid:submit"] },
    } as never);
    const draftBid = { ...submittedBid, status: "DRAFT" as const };
    // Bağlantısı düşen ücretsiz üye: teklif hakkı yok → canlandıramaz.
    const noRight = render(
      <BidSummaryCard l={detail({ status: "OPEN", canBid: false, myBid: draftBid })} />,
    );
    expect(screen.queryByRole("button", { name: "Geçerliliği Uzat" })).not.toBeInTheDocument();
    noRight.unmount();
    // Davetsiz/bağlantısız ve doğrulanmamış: gönderim KYC ister → çizilmez.
    const kyc = render(
      <BidSummaryCard
        l={detail({ status: "OPEN", canBid: true, bidRequiresVerification: true, myBid: draftBid })}
      />,
    );
    expect(screen.queryByRole("button", { name: "Geçerliliği Uzat" })).not.toBeInTheDocument();
    kyc.unmount();
    // Bağlantılı doğrulanmamış (KYC muaf): canlandırabilir.
    render(
      <BidSummaryCard
        l={detail({ status: "OPEN", canBid: true, bidRequiresVerification: false, myBid: draftBid })}
      />,
    );
    expect(screen.getByRole("button", { name: "Geçerliliği Uzat" })).toBeInTheDocument();
  });

  it("statü/versiyon/toplam + kalem satırı + not", () => {
    render(
      <BidSummaryCard
        l={detail({
          myBid: {
            amount: "1500",
            status: "SUBMITTED",
            version: 1,
            note: "Hızlı teslimat yapılır",
            currency: "TRY",
            items: [{ itemId: "i1", unitPrice: "150" }],
          },
        })}
      />,
    );
    expect(screen.getByText("Gönderildi")).toBeInTheDocument();
    // v1 gizli (yalnız v2+ gösterilir).
    expect(screen.queryByText("v1")).not.toBeInTheDocument();
    // "1.500 ₺" üst Toplam + kalem satır toplamı (10×150) + tablo dipnotu
    // Toplam satırında geçer.
    expect(screen.getAllByText("1.500,00 ₺")).toHaveLength(3);
    expect(screen.getByText(/Çelik Boru/)).toBeInTheDocument();
    expect(screen.getByText("Fiyatlandırılan Kalemler (1)")).toBeInTheDocument();
    expect(screen.getByText("Hızlı teslimat yapılır")).toBeInTheDocument();
  });

  it("çok-birimli teklif: kalem satırı KALEMİN biriminde, toplam ana birimde + çevrim notu (derin denetim Y-14)", () => {
    render(
      <BidSummaryCard
        l={detail({
          myBid: {
            amount: "1000",
            status: "SUBMITTED",
            version: 1,
            note: null,
            currency: "EUR",
            items: [{ itemId: "i1", unitPrice: "5000", currency: "TRY" }],
          },
        })}
      />,
    );
    // Eskiden "5.000 €" / "50.000 €" basılıyordu.
    expect(screen.getByText("5.000,00 ₺")).toBeInTheDocument();
    expect(screen.getByText("50.000,00 ₺")).toBeInTheDocument();
    expect(screen.queryByText("5.000 €")).not.toBeInTheDocument();
    expect(screen.queryByText("50.000 €")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Kalem fiyatları teklifin ana birimine (EUR) çevrilerek toplandı.",
      ),
    ).toBeInTheDocument();
  });

  it("tek birimli teklifte çevrim notu görünmez", () => {
    render(
      <BidSummaryCard
        l={detail({
          myBid: {
            amount: "1500",
            status: "SUBMITTED",
            version: 1,
            note: null,
            currency: "TRY",
            items: [{ itemId: "i1", unitPrice: "150", currency: null }],
          },
        })}
      />,
    );
    expect(screen.queryByText(/ana birimine/)).not.toBeInTheDocument();
  });
});
