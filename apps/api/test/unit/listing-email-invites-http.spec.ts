/**
 * `GET /api/company/connections/external-tender-invites?listingId=` over real
 * HTTP (round 5, D3): the REAL controller, the REAL permission guard and the
 * production validation options, on a small Nest application. Only the
 * session (a header instead of the cookie JWT) and the reader service are
 * stand-ins. Reader behaviour against the database is in
 * `test/integration/listing-email-invites.spec.ts`.
 */
import "reflect-metadata";
import { Module, NotFoundException, ValidationPipe, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { AddressInfo } from "node:net";
import { CompanyConnectionsController } from "../../src/modules/company-connections/controllers/company-connections.controller";
import { CompanyConnectionsService } from "../../src/modules/company-connections/services/company-connections.service";
import { ListingEmailInvitesService } from "../../src/modules/company-connections/services/listing-email-invites.service";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const passport = require("passport") as {
  use(name: string, strategy: unknown): void;
  Strategy: new () => { success(user: unknown): void; fail(status: number): void };
};

const member = (permissions: string[]) => ({
  userId: "u1",
  companyId: "c1",
  email: "u1@firma.com",
  roles: [],
  isOwner: false,
  permissions,
  // No package: the route asks for none.
  tier: "STANDART",
  companyVerificationStatus: "VERIFIED",
});
const USERS: Record<string, ReturnType<typeof member>> = {
  buyer: member(["buy:view"]),
  seller: member(["sell:view", "connections:manage"]),
};

/** Session stand-in for `CompanyJwtAuthGuard` (strategy name "company-jwt"). */
class HeaderSession extends passport.Strategy {
  name = "company-jwt";
  authenticate(req: { headers: Record<string, string | undefined> }) {
    const user = USERS[req.headers["x-test-user"] ?? ""];
    if (user) this.success(user);
    else this.fail(401);
  }
}

const ITEM = {
  id: "inv1",
  email: "sales@tubacex.com",
  name: null,
  country: null,
  locale: "en",
  source: "AI_FORM",
  invite: "QUEUED",
  reason: null,
  sendAfter: "2030-01-01T09:00:00.000Z",
  sentAt: null,
  createdAt: "2029-12-31T09:00:00.000Z",
};
const reader = { forListing: jest.fn() };

@Module({
  controllers: [CompanyConnectionsController],
  providers: [
    { provide: CompanyConnectionsService, useValue: {} },
    { provide: ListingEmailInvitesService, useValue: reader },
  ],
})
class HttpRig {}

describe("GET /api/company/connections/external-tender-invites (HTTP)", () => {
  let app: INestApplication;
  let base: string;

  beforeAll(async () => {
    passport.use("company-jwt", new HeaderSession());
    app = await NestFactory.create(HttpRig, { logger: false });
    app.setGlobalPrefix("api");
    // Same options as `main.ts`.
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.listen(0, "127.0.0.1");
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api/company/connections/external-tender-invites`;
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    reader.forListing.mockReset().mockResolvedValue({ items: [ITEM] });
  });

  const get = (query: string, user?: string) => fetch(`${base}${query}`, { headers: user ? { "x-test-user": user } : {} });

  it("a `buy:view` member without a package gets the list of the request", async () => {
    const res = await get("?listingId=l1", "buyer");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [ITEM] });
    expect(reader.forListing).toHaveBeenCalledTimes(1);
    expect(reader.forListing).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", companyId: "c1" }), "l1");
  });

  it("no session 401; a member of the selling side only 403 - before the query is even validated", async () => {
    expect((await get("?listingId=l1")).status).toBe(401);
    expect((await get("?listingId=l1", "seller")).status).toBe(403);
    expect((await get("", "seller")).status).toBe(403);
    expect(reader.forListing).not.toHaveBeenCalled();
  });

  it("the request id is required; unknown query parameters are refused (400), the reader is not called", async () => {
    expect((await get("", "buyer")).status).toBe(400);
    expect((await get("?listingId=", "buyer")).status).toBe(400);
    expect((await get(`?listingId=${"x".repeat(41)}`, "buyer")).status).toBe(400);
    expect((await get("?listingId=l1&companyId=c2", "buyer")).status).toBe(400);
    expect(reader.forListing).not.toHaveBeenCalled();
  });

  it("another company's request: the reader's 404 reaches the client", async () => {
    reader.forListing.mockRejectedValue(new NotFoundException("not found"));
    expect((await get("?listingId=someone-elses", "buyer")).status).toBe(404);
  });
});
