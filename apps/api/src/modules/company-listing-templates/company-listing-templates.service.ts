import { i18nMessage } from "../../common/i18n/http-i18n";
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@rothern/db";
import { isHiddenCategory } from "@rothern/shared";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { AuthenticatedCompanyUser } from "../company-auth/strategies/company-jwt.strategy";

/** Field names that carry a category: `categoryIds`, `categoryId`, `categories`... */
const CATEGORY_KEY_RE = /categor/i;
/** The form's payload is two levels deep; anything deeper is not a field the form reads. */
const MAX_WALK_DEPTH = 16;

/**
 * A TEMPLATE NEVER CARRIES A CATEGORY UNDER A HIDDEN SEGMENT (owner rule
 * 2026-10-09; live re-check CP-07). The payload is the request form's values,
 * stored as free JSON, so the gates of requests and products did not apply: a
 * hand-made `POST company/listing-templates` with a hidden code answered 201
 * and the code sat in the row. Nothing showed it (the form seeds visible codes
 * only), but the rule is "a new or changed category value is a visible one",
 * and a template is the seed of NEW requests.
 *
 * Applied on SAVE (the row never holds the code) and on READ (a template saved
 * before its segment was hidden). Only fields whose NAME carries a category
 * are touched: a list loses its hidden codes (order kept), a single hidden
 * code becomes `null`. Every other value of the payload stays as it is.
 * Single source of "hidden": `isHiddenCategory` (`@rothern/shared`).
 */
export function templatePayloadWithoutHiddenCategories(value: unknown, categoryField = false, depth = 0): unknown {
  // A code is digits only; free text in a category-named field is left alone.
  const hidden = (v: unknown) => typeof v === "string" && /^\d+$/.test(v.trim()) && isHiddenCategory(v.trim());
  if (depth > MAX_WALK_DEPTH) return value;
  if (Array.isArray(value)) {
    const kept = categoryField ? value.filter((v) => !hidden(v)) : value;
    return kept.map((v) => templatePayloadWithoutHiddenCategories(v, categoryField, depth + 1));
  }
  if (value === null || typeof value !== "object") return categoryField && hidden(value) ? null : value;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    out[key] = templatePayloadWithoutHiddenCategories(v, CATEGORY_KEY_RE.test(key), depth + 1);
  }
  return out;
}

@Injectable()
export class CompanyListingTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  // Şablon payload'ı için makul üst sınır (25MB global gövde limitinin altında
  // ayrı koruma — @IsObject boyut sınırlamıyordu, DoS-boyut riski).
  private static readonly MAX_PAYLOAD_BYTES = 512_000;

  async save(
    user: AuthenticatedCompanyUser,
    input: { name: string; payload: unknown },
  ) {
    if (
      JSON.stringify(input.payload ?? null).length >
      CompanyListingTemplatesService.MAX_PAYLOAD_BYTES
    ) {
      throw new BadRequestException(i18nMessage("api.companyListingTemplates.sablonIcerigiCokBuyukMaks500"));
    }
    const t = await this.prisma.listingTemplate.create({
      data: {
        companyId: user.companyId,
        name: input.name.trim(),
        payload: templatePayloadWithoutHiddenCategories(input.payload) as Prisma.InputJsonValue,
        createdById: user.userId,
      },
    });
    return { id: t.id, name: t.name };
  }

  async list(companyId: string) {
    const rows = await this.prisma.listingTemplate.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return rows.map((t) => ({
      id: t.id,
      name: t.name,
      payload: templatePayloadWithoutHiddenCategories(t.payload),
      createdAt: t.createdAt,
    }));
  }

  async remove(user: AuthenticatedCompanyUser, id: string) {
    const t = await this.prisma.listingTemplate.findUnique({
      where: { id },
      select: { companyId: true },
    });
    if (!t || t.companyId !== user.companyId) {
      throw new NotFoundException(i18nMessage("api.companyListingTemplates.sablonBulunamadi"));
    }
    await this.prisma.listingTemplate.delete({ where: { id } });
    return { ok: true };
  }
}
