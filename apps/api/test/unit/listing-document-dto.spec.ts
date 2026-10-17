import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import {
  ListingDocUploadUrlDto,
  RegisterListingDocDto,
} from "../../src/modules/company-listing-documents/dto/listing-document.dto";

/**
 * Derin denetim 2026-09-29 X15/X01/S027: talep belgesi uçlarının gövdesi satır
 * içi tip literaliydi, global ValidationPipe çalışmıyordu → bozuk gövde 400
 * yerine servis içinde TypeError/Prisma hatasıyla 500 veriyordu.
 */
async function errorsOf(
  cls: new () => object,
  body: unknown,
): Promise<string[]> {
  const errs = await validate(plainToInstance(cls, body) as object, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errs.map((e) => e.property);
}

describe("ListingDocUploadUrlDto", () => {
  const base = { fileName: "sartname.pdf", mimeType: "application/pdf", fileSize: 1024 };

  it("web istemcisinin gövdesi geçerli", async () => {
    expect(await errorsOf(ListingDocUploadUrlDto, base)).toEqual([]);
  });

  it("string olmayan / eksik fileName reddedilir", async () => {
    expect(await errorsOf(ListingDocUploadUrlDto, { ...base, fileName: 123 })).toContain(
      "fileName",
    );
    const { fileName: _omit, ...rest } = base;
    expect(await errorsOf(ListingDocUploadUrlDto, rest)).toContain("fileName");
  });

  it("tamsayı olmayan fileSize ve fazladan alan reddedilir", async () => {
    expect(await errorsOf(ListingDocUploadUrlDto, { ...base, fileSize: "big" })).toContain(
      "fileSize",
    );
    expect(await errorsOf(ListingDocUploadUrlDto, { ...base, extra: 1 })).toContain("extra");
  });
});

describe("RegisterListingDocDto", () => {
  const base = {
    key: "listing-docs/l1/uuid-sartname.pdf",
    fileName: "sartname.pdf",
    mimeType: "application/pdf",
    kind: "TEKNIK_SARTNAME",
  };

  it("web istemcisinin gövdesi geçerli (kind/itemId isteğe bağlı)", async () => {
    expect(await errorsOf(RegisterListingDocDto, base)).toEqual([]);
    expect(await errorsOf(RegisterListingDocDto, { ...base, kind: undefined })).toEqual([]);
    expect(await errorsOf(RegisterListingDocDto, { ...base, itemId: "ckitem123" })).toEqual([]);
  });

  it("geçersiz kind enum'u reddedilir", async () => {
    expect(await errorsOf(RegisterListingDocDto, { ...base, kind: "FOO" })).toContain("kind");
  });

  it("dizi key / nesne itemId reddedilir", async () => {
    expect(await errorsOf(RegisterListingDocDto, { ...base, key: ["x"] })).toContain("key");
    expect(await errorsOf(RegisterListingDocDto, { ...base, itemId: { a: 1 } })).toContain(
      "itemId",
    );
  });
});
