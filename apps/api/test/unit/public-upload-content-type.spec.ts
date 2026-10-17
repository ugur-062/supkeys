/**
 * Derin denetim Y-01 — public kovaya presigned PUT içerik tipini İMZALAR.
 *
 * SDK varsayılanı content-type'ı imzalamıyordu (`prepareRequest` →
 * `unsignableHeaders.add("content-type")`): firma sahibi logo için
 * "image/png" beyan edip dönen URL'e `Content-Type: text/html` ile sahte bir
 * sayfa PUT edebiliyor, resolve/commit'i hiç çağırmadan nesne
 * cdn.rothern.com'da text/html olarak yayında kalıyordu. Artık public URL'in
 * X-Amz-SignedHeaders'ı content-type içerir → farklı tiple PUT imza hatası.
 */
import { BadRequestException, Logger } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { S3Client } from "@aws-sdk/client-s3";
import { StorageService } from "../../src/modules/storage/storage.service";
import {
  requestPublicDocumentUpload,
  requestPublicImageUpload,
} from "../../src/common/company/public-image-upload";
import { assertUploadedObjectValid } from "../../src/common/helpers/upload-validation";

function makeService(): StorageService {
  const svc = new StorageService({
    get: () => undefined,
  } as unknown as ConfigService);
  const s = svc as unknown as Record<string, unknown>;
  s.envPrefix = "prod";
  s.publicBucket = "rothern-public";
  s.privateBucket = "rothern-prod";
  // Ağ YOK: presign yerelde hesaplanır, sahte kimlik yeterli.
  s.client = new S3Client({
    region: "auto",
    endpoint: "https://acc.r2.cloudflarestorage.com",
    credentials: { accessKeyId: "test", secretAccessKey: "test" },
  });
  return svc;
}

function signedHeaders(url: string): string[] {
  return (new URL(url).searchParams.get("X-Amz-SignedHeaders") ?? "").split(";");
}

describe("Y-01 — public presigned PUT content-type'ı imzaya bağlar", () => {
  it("public kova: X-Amz-SignedHeaders content-type içerir", async () => {
    const url = await makeService().generatePresignedPut(
      "public",
      "prod/tenant-profile/co_1/logo-uuid-a.png",
      "image/png",
    );
    expect(signedHeaders(url)).toEqual(
      expect.arrayContaining(["content-type", "host"]),
    );
  });

  it("private kova davranışı değişmedi (yalnız host imzalı)", async () => {
    const url = await makeService().generatePresignedPut(
      "private",
      "company-docs/co_1/kyc-uuid-vergi.pdf",
      "application/pdf",
    );
    expect(signedHeaders(url)).not.toContain("content-type");
  });

  it("logo yükleme URL'i (requestPublicImageUpload) içerik tipi imzalı", async () => {
    const { url, key } = await requestPublicImageUpload(
      makeService(),
      "co_1",
      "logo",
      "a.png",
      "image/png",
    );
    expect(key.startsWith("prod/tenant-profile/co_1/")).toBe(true);
    expect(signedHeaders(url)).toContain("content-type");
  });

  it("ürün belgesi yükleme URL'i (requestPublicDocumentUpload) içerik tipi imzalı", async () => {
    const { url } = await requestPublicDocumentUpload(
      makeService(),
      "co_1",
      "katalog.pdf",
      "application/pdf",
    );
    expect(signedHeaders(url)).toContain("content-type");
  });

  it("allowlist dışı MIME için public URL hiç üretilmez", async () => {
    for (const mime of ["text/html", "image/svg+xml"]) {
      await expect(
        requestPublicImageUpload(makeService(), "co_1", "logo", "a.png", mime),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
    await expect(
      requestPublicDocumentUpload(makeService(), "co_1", "a.pdf", "text/html"),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("Y-01 — reddedilen nesne silinemezse sessizce yutulmaz", () => {
  it("DeleteObject (nesne kilidi) reddederse istek yine 400 ve anahtar uyarı olarak loglanır", async () => {
    const warn = jest
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);
    const storage = {
      checkExists: jest
        .fn()
        .mockResolvedValue({ exists: true, size: 100, contentType: "text/html" }),
      deleteObject: jest
        .fn()
        .mockRejectedValue(new Error("AccessDenied: object lock")),
    };
    const key = "prod/tenant-profile/co_1/logo-uuid-a.png";
    await expect(
      assertUploadedObjectValid(storage as never, "public", key, 1000, [
        "image/png",
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.deleteObject).toHaveBeenCalledWith("public", key);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(key));
    warn.mockRestore();
  });
});
