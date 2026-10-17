import { describe, expect, it } from "vitest";
import {
  MOBILE_APP_ID,
  androidAssetLinks,
  androidFingerprints,
  appLinkResponse,
  appleAppSiteAssociation,
} from "./mobile-app-links";

const FP_A = Array.from({ length: 32 }, () => "AB").join(":");
const FP_B = Array.from({ length: 32 }, () => "0C").join(":");

describe("mobil uygulama bağlantı beyanları", () => {
  it("Android: env yoksa ya da parmak izi bozuksa beyan yok", () => {
    expect(androidAssetLinks({})).toBeNull();
    expect(androidAssetLinks({ MOBILE_ANDROID_SHA256: "AB:CD" })).toBeNull();
    expect(androidAssetLinks({ MOBILE_ANDROID_SHA256: " , " })).toBeNull();
  });

  it("Android: virgüllü parmak izleri büyük harfe çevrilir, bozuk olan atılır", () => {
    const env = { MOBILE_ANDROID_SHA256: `${FP_A.toLowerCase()}, bozuk ,${FP_B}` };
    expect(androidFingerprints(env)).toEqual([FP_A, FP_B]);
    const [statement] = androidAssetLinks(env) as Array<{
      relation: string[];
      target: { package_name: string; sha256_cert_fingerprints: string[] };
    }>;
    expect(statement.relation).toContain("delegate_permission/common.handle_all_urls");
    expect(statement.target.package_name).toBe(MOBILE_APP_ID);
    expect(statement.target.sha256_cert_fingerprints).toEqual([FP_A, FP_B]);
  });

  it("iOS: takım kimliği 10 karakter değilse beyan yok", () => {
    expect(appleAppSiteAssociation({})).toBeNull();
    expect(appleAppSiteAssociation({ MOBILE_IOS_TEAM_ID: "ABC" })).toBeNull();
  });

  it("iOS: rota işleyicileri uygulamaya devredilmez, sayfalar devredilir", () => {
    const body = appleAppSiteAssociation({ MOBILE_IOS_TEAM_ID: "abcde12345" }) as {
      applinks: { details: Array<{ appIDs: string[]; components: Array<Record<string, unknown>> }> };
      webcredentials: { apps: string[] };
    };
    const [detail] = body.applinks.details;
    expect(detail.appIDs).toEqual([`ABCDE12345.${MOBILE_APP_ID}`]);
    expect(detail.components[0]).toEqual({ "/": "/api/*", exclude: true });
    expect(detail.components.at(-1)).toEqual({ "/": "*" });
    expect(body.webcredentials.apps).toEqual(detail.appIDs);
  });

  it("yanıt: beyan yoksa 404, varsa application/json", async () => {
    expect(appLinkResponse(null).status).toBe(404);
    const res = appLinkResponse({ ok: true });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(await res.json()).toEqual({ ok: true });
  });
});
