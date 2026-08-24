import { EVENT_LISTENER_METADATA } from "@nestjs/event-emitter/dist/constants";
import { CompanyListingsService } from "../../src/modules/company-listings/services/company-listings.service";

/**
 * Denetim 2026-08-23 Parça 4 (HIGH) — @OnEvent dinleyicilerinde
 * `suppressErrors: false` SÖZLEŞMESİ.
 *
 * @nestjs/event-emitter varsayılanı TRUE'dur (dist/event-subscribers.loader.js
 * → wrapFunctionInTryCatchBlocks: `options?.suppressErrors ?? true`): dinleyici
 * hata fırlatsa bile yalnız loglanır ve `emitAsync` BAŞARILI döner.
 * company-approvals `emitAsync` sonucuna güvenip fail-closed geri alma yapıyor
 * (onay adımını PENDING'e döndürüp 400 atıyor) — varsayılan yutma yüzünden bu
 * mekanizma üretimde HİÇ çalışmıyordu: onay APPROVED kalıyor, sipariş
 * oluşmuyor, ilan onay durumunda takılıyordu.
 *
 * Bu test yeni bir dinleyici eklendiğinde bayrağın unutulmasını engeller.
 */
type ListenerMeta = { event: string; options?: { suppressErrors?: boolean } };

function listenersOf(proto: object): { method: string; meta: ListenerMeta }[] {
  const out: { method: string; meta: ListenerMeta }[] = [];
  for (const method of Object.getOwnPropertyNames(proto)) {
    const desc = Object.getOwnPropertyDescriptor(proto, method);
    if (!desc || typeof desc.value !== "function") continue;
    const metas = Reflect.getMetadata(EVENT_LISTENER_METADATA, desc.value) as
      | ListenerMeta[]
      | undefined;
    if (!metas) continue;
    for (const meta of metas) out.push({ method, meta });
  }
  return out;
}

describe("@OnEvent fail-closed sözleşmesi", () => {
  const listeners = listenersOf(CompanyListingsService.prototype);

  it("ilan/kazandırma olay dinleyicileri bulunur (metadata okunabiliyor)", () => {
    const events = listeners.map((l) => l.meta.event).sort();
    expect(events).toEqual([
      "listing.award.approved",
      "listing.award.rejected",
      "listing.publish.approved",
      "listing.publish.rejected",
    ]);
  });

  it("emitAsync ile beklenen `*.approved` dinleyicileri suppressErrors:false — hata çağırana döner", () => {
    const awaited = listeners.filter((l) => l.meta.event.endsWith(".approved"));
    expect(awaited).toHaveLength(2);
    for (const { method, meta } of awaited) {
      expect({ method, suppressErrors: meta.options?.suppressErrors }).toEqual({
        method,
        suppressErrors: false,
      });
    }
  });

  it("`*.rejected` dinleyicileri (emit, beklenmez) varsayılanda kalır — hatayı KENDİ try/catch'i Sentry'e taşır", () => {
    const fired = listeners.filter((l) => l.meta.event.endsWith(".rejected"));
    expect(fired).toHaveLength(2);
    for (const { meta } of fired) {
      // suppressErrors:false burada yalnız unhandledRejection üretirdi.
      expect(meta.options?.suppressErrors).toBeUndefined();
    }
    const src = require("node:fs").readFileSync(
      require("node:path").join(
        __dirname,
        "../../src/modules/company-listings/services/company-listings.service.ts",
      ),
      "utf8",
    ) as string;
    // Gövdeler try/catch + reportToSentry içerir (sessiz durum-driftı yok).
    expect(src).toMatch(/listing\.publish\.rejected uygulanamadı/);
    expect(src).toMatch(/listing\.award\.rejected uygulanamadı/);
  });
});
