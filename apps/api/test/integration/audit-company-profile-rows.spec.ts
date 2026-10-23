/**
 * ADMIN COMPANY "DENETIM" TAB - the company's own PROFILE records (live
 * re-check 2026-10-09, PD-R5).
 *
 * The tab calls `GET admin/audit-logs?search=<company id>`. Seen live: after
 * three AI description suggestions the tab listed both "company profile
 * updated" rows of those minutes and none of the six suggestion rows - they
 * were found only in the global audit log. Why: a company-actor row matched
 * the search only through `entityId`; the suggestion rows carry the company
 * only in `tenantId` (attempt and success rows have no entity, the "settled"
 * row points at the attempt row).
 *
 * Contract:
 *  - the tab lists the company's profile records: `company.profile.updated`
 *    and the three suggestion actions (`company.profile_enrich_attempt`,
 *    `company.profile_enrich_settled`, `company.profile_enriched`);
 *  - only those: the rest of the company's own activity stays out of the tab;
 *  - another company's tab does not show them;
 *  - the company's own activity log lists the three suggestion actions under
 *    its "profile" filter (the attempt rows showed under "All" only).
 *
 * The suggestion rows are written by the REAL service (fake provider), so the
 * test keeps reading the shape production writes. Order of rows written a few
 * milliseconds apart is not asserted.
 */
import "reflect-metadata";
import type { CompanyRole } from "@rothern/db";
import { AiBudgetService } from "../../src/modules/ai/ai-budget.service";
import { loadAiConfig } from "../../src/modules/ai/ai.config";
import { AiService } from "../../src/modules/ai/ai.service";
import { ProfileEnrichService } from "../../src/modules/ai/profile-enrich/profile-enrich.service";
import {
  BaseAiProvider,
  type AiCompletionRequest,
  type AiCompletionResult,
} from "../../src/modules/ai/providers/ai-provider.interface";
import { AuditService, COMPANY_PROFILE_ACTION_PREFIX } from "../../src/modules/audit/audit.service";
import type { AuthenticatedCompanyUser } from "../../src/modules/company-auth/strategies/company-jwt.strategy";
import { makeCompanyWithUser } from "./factories";
import { prisma, truncateAll } from "./test-db";

const CFG = loadAiConfig({ get: (key: string) => (key === "GEMINI_API_KEY" ? "test-key" : undefined) });

class FakeProvider extends BaseAiProvider {
  readonly name = "fake";
  async complete(_req: AiCompletionRequest): Promise<AiCompletionResult> {
    return {
      text: JSON.stringify({ aboutText: "Acme Vana olarak İzmir'de küresel vana üretiyoruz." }),
      usage: { inputTokens: 900, outputTokens: 400, cacheReadTokens: 0, cacheWriteTokens: 0 },
    };
  }
}

const SUGGESTION_ACTIONS = [
  "company.profile_enrich_attempt",
  "company.profile_enrich_settled",
  "company.profile_enriched",
];

/** A company without full access: its suggestion writes all three rows (attempt, settled, success). */
async function companyWithSuggestion() {
  const co = await makeCompanyWithUser(prisma, {
    name: "Acme Vana",
    tier: "STANDART",
    companyVerificationStatus: "UNVERIFIED",
  });
  // The suggestion needs something to write about.
  await prisma.company.update({
    where: { id: co.company.id },
    data: { city: "İzmir", industry: "Endüstriyel vana", services: ["Vana bakımı"] },
  });
  const auth = {
    userId: co.user.id,
    companyId: co.company.id,
    email: co.user.email,
    roles: co.auth.roles as CompanyRole[],
    isOwner: true,
    country: "TR",
    tier: "STANDART",
    companyVerificationStatus: "UNVERIFIED",
  } as unknown as AuthenticatedCompanyUser;
  const audit = new AuditService(prisma as never);
  const ai = new AiService(CFG, new FakeProvider(), new AiBudgetService(prisma as never, CFG), prisma as never, undefined);
  await new ProfileEnrichService(prisma as never, audit, ai).enrich(auth);
  return { ...co, auth, audit };
}

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("PD-R5: admin company audit search lists the company's own profile records", () => {
  it("the AI description suggestion rows appear next to 'company profile updated'; other own activity and other companies stay out", async () => {
    const { company, user, audit } = await companyWithSuggestion();
    // The profile save of the same minutes, as `CompanyProfileService.update` writes it.
    await audit.log({
      action: "company.profile.updated",
      actorType: "company",
      actorId: user.id,
      actorEmail: user.email,
      tenantId: company.id,
      entityType: "company",
      entityId: company.id,
      metadata: { changedFields: ["aboutText"] },
    });
    // The company's other activity, and an admin intervention on it.
    await audit.log({
      action: "company.listing.published",
      actorType: "company",
      actorId: user.id,
      actorEmail: user.email,
      tenantId: company.id,
      entityType: "listing",
      entityId: "listing-1",
    });
    await audit.log({
      action: "admin.company.note_added",
      actorType: "admin",
      actorId: "adm1",
      tenantId: company.id,
      entityType: "company_note",
      entityId: "note-1",
    });
    // What production wrote for the suggestion: the company is only in `tenantId`.
    const written = await prisma.auditLog.findMany({
      where: { tenantId: company.id, action: { in: SUGGESTION_ACTIONS } },
      select: { action: true, entityId: true },
    });
    expect(written.map((r) => r.action).sort()).toEqual([...SUGGESTION_ACTIONS].sort());
    expect(written.every((r) => r.entityId !== company.id)).toBe(true);

    const tab = await audit.query({ search: company.id });

    expect(tab.items.map((r) => r.action).sort()).toEqual(
      ["admin.company.note_added", "company.profile.updated", ...SUGGESTION_ACTIONS].sort(),
    );
    expect(tab.pagination.total).toBe(5);
    // The row keeps what the admin screen formats (actor, metadata).
    const attempt = tab.items.find((r) => r.action === "company.profile_enrich_attempt")!;
    expect(attempt).toMatchObject({ actorType: "company", actorEmail: user.email, tenantId: company.id });
    expect(attempt.metadata).toEqual({ products: 0 });

    // Another company's tab shows none of it.
    const other = await makeCompanyWithUser(prisma, {});
    expect((await audit.query({ search: other.company.id })).items).toEqual([]);
    // The filters of the global viewer still narrow the same search.
    const onlyAdmin = await audit.query({ search: company.id, actorType: "admin" });
    expect(onlyAdmin.items.map((r) => r.action)).toEqual(["admin.company.note_added"]);
    const onlyEnrich = await audit.query({ search: company.id, action: "company.profile_enrich" });
    expect(onlyEnrich.items.map((r) => r.action).sort()).toEqual([...SUGGESTION_ACTIONS].sort());
  });

  it("the prefix covers the profile family and nothing next to it", () => {
    for (const action of ["company.profile.updated", ...SUGGESTION_ACTIONS]) {
      expect(action.startsWith(COMPANY_PROFILE_ACTION_PREFIX)).toBe(true);
    }
    for (const action of ["company.product.updated", "company.listing.published", "company.user.profile_updated"]) {
      expect(action.startsWith(COMPANY_PROFILE_ACTION_PREFIX)).toBe(false);
    }
  });

  it("the company's own activity log: the 'profile' filter lists the suggestion attempt rows too, not only the success row", async () => {
    const { company, user, audit } = await companyWithSuggestion();
    await audit.log({
      action: "company.listing.published",
      actorType: "company",
      actorId: user.id,
      actorEmail: user.email,
      tenantId: company.id,
      entityType: "listing",
      entityId: "listing-1",
    });

    const profile = await audit.queryForTenant(company.id, { module: "profile" });

    expect(profile.items.map((r) => r.action).sort()).toEqual([...SUGGESTION_ACTIONS].sort());
    const all = await audit.queryForTenant(company.id);
    expect(all.items).toHaveLength(4);
  });
});
