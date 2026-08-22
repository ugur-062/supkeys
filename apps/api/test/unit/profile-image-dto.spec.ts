import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import {
  ProfileImageCommitDto,
  ProfileImageUploadDto,
} from "../../src/modules/company-profile/dto/profile-image.dto";

/**
 * Regresyon (2026-08-22): upload-url "gallery" kabul ederken commit etmiyordu →
 * galeri/sertifika görselleri hiç yüklenemiyordu. İki DTO aynı kind kümesini
 * kabul etmeli (hook tek kind ile iki ucu da çağırır).
 */
describe("profile image DTO — kind kümesi simetrik", () => {
  it.each(["logo", "cover", "gallery"] as const)("%s: upload-url + commit ikisi de geçer", async (kind) => {
    const up = plainToInstance(ProfileImageUploadDto, { kind, fileName: "a.png", mimeType: "image/png" });
    const cm = plainToInstance(ProfileImageCommitDto, { kind, key: "dev/tenant-profile/x/gallery-1-a.png" });
    expect(await validate(up)).toHaveLength(0);
    expect(await validate(cm)).toHaveLength(0);
  });
  it("bilinmeyen kind reddedilir", async () => {
    const cm = plainToInstance(ProfileImageCommitDto, { kind: "avatar", key: "k" });
    expect((await validate(cm)).length).toBeGreaterThan(0);
  });
});
