import { Injectable, NotFoundException } from "@nestjs/common";
import { i18nMessage } from "../../../common/i18n/http-i18n";
import type { InviteSourceKind } from "../../../common/company/external-invite-policy";
import { PrismaBypassService, PrismaService } from "../../../common/prisma/prisma.service";
// The ONE definition of "what happened to a queued e-mail invitation" is
// `candidateInvite` (status band of the automatic run). It is imported, not
// copied: the two screens of the same request page must not disagree.
// `withQueueForecast` comes from the same place for the same reason: a queued
// row is read with the dispatcher's forecast, exactly as the band reads it.
// This file exists apart from `CompanyConnectionsService` because
// `discovery-runs.service` imports that service (and the dispatcher) - an
// import from there would be circular. Neither of those two may import this file.
import {
  candidateInvite,
  withQueueForecast,
  type ScreenQueueRow,
} from "../../ai/supplier-discovery/discovery-runs.service";
import type { AuthenticatedCompanyUser } from "../../company-auth/strategies/company-jwt.strategy";

/** Outcome of an e-mail invitation as the buyer sees it (subset of `CandidateInviteState`). */
export type EmailInviteState = "INVITED" | "QUEUED" | "NOT_SENT";

export interface ListingEmailInvite {
  id: string;
  email: string;
  /** Company name the discovery of THIS request found for the address; null when typed by hand. */
  name: string | null;
  country: string | null;
  locale: string;
  source: InviteSourceKind;
  invite: EmailInviteState;
  /**
   * NOT_SENT: reason code (FREQUENCY, PAUSED, OPTED_OUT, REGISTERED, LISTING_CLOSED, ALLOWLIST, CANCELLED, FAILED...;
   * `CLOSES_FIRST` = still in the queue, but its turn comes after the request closes).
   */
  reason: string | null;
  /** QUEUED: the moment the e-mail can really leave (ISO) - after the 7-day hold of the address, when it has one. */
  sendAfter: string | null;
  sentAt: string | null;
  createdAt: string;
}

/** A request cannot collect more rows than this in practice (60 a day per company). */
const MAX_ROWS = 500;

/**
 * Queue row -> what the buyer is told. Pure; the vocabulary is
 * `candidateInvite`'s: INVITED = the e-mail was sent, QUEUED (+ `sendAfter`),
 * NOT_SENT (+ reason: the dispatcher's cancel reason, `CANCELLED` for a
 * withdrawn invitation, `FAILED` for a failed delivery; for a row still in the
 * queue that will not leave before the request closes, the forecast's reason).
 */
export function emailInviteOutcome(row: ScreenQueueRow): {
  invite: EmailInviteState;
  reason: string | null;
  sendAfter: string | null;
} {
  // No member, a queue row present: `candidateInvite` answers from the row and its forecast.
  const out = candidateInvite({ status: "INVITED", memberCompanyId: null, memberInvited: false, queue: row, active: false });
  return {
    invite: out.invite === "INVITED" || out.invite === "QUEUED" ? out.invite : "NOT_SENT",
    reason: out.inviteReason,
    sendAfter: out.sendAfter,
  };
}

/**
 * E-MAIL INVITATIONS OF A REQUEST - read side (round 5, D3).
 *
 * The buyer invited an address from the "find suppliers" window (or typed it)
 * and afterwards the request page showed no trace of it: the queue
 * (`external_listing_invites`) was read for the buyer only through the
 * candidates of an automatic run. This lists EVERY e-mail invitation of the
 * request - all sources (typed, picked in the window, automatic run), newest
 * first - with the same outcome vocabulary as the run's status band.
 *
 * Access: any member of the request's OWNER company (the route asks
 * `buy:view`); no package tier - a company that lost Gold still sees what it
 * sent. Another company's request is "not found" (its existence is not told).
 */
@Injectable()
export class ListingEmailInvitesService {
  constructor(
    private readonly prisma: PrismaService,
    /** Forecast of the queued rows: every buyer's letters to the address (sent and queued), not only this company's. */
    private readonly bypass: PrismaBypassService,
  ) {}

  async forListing(user: AuthenticatedCompanyUser, listingId: string): Promise<{ items: ListingEmailInvite[] }> {
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, companyId: user.companyId },
      select: { id: true, closesAt: true },
    });
    if (!listing) throw new NotFoundException(i18nMessage("api.companyConnections.satinAlmaTalebiBulunamadi"));

    const stored = await this.prisma.externalListingInvite.findMany({
      where: { listingId: listing.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: MAX_ROWS,
      select: {
        id: true,
        email: true,
        country: true,
        locale: true,
        source: true,
        state: true,
        cancelReason: true,
        sendAfter: true,
        sentAt: true,
        createdAt: true,
      },
    });
    if (stored.length === 0) return { items: [] };
    // Same forecast as the run's band and the creator's message (AUTO-COUNT-1).
    const rows = await withQueueForecast(this.bypass, stored, listing, new Date());

    // Company name: only what the discovery of THIS request found for the
    // address (newest run wins). A typed address has no name.
    const candidates = await this.prisma.supplierDiscoveryCandidate.findMany({
      where: { run: { listingId: listing.id }, email: { in: rows.map((r) => r.email) } },
      orderBy: { createdAt: "desc" },
      select: { email: true, name: true },
    });
    const nameOf = new Map<string, string>();
    for (const c of candidates) {
      const name = c.name.trim();
      if (c.email && name && !nameOf.has(c.email)) nameOf.set(c.email, name);
    }

    return {
      items: rows.map((r) => ({
        id: r.id,
        email: r.email,
        name: nameOf.get(r.email) ?? null,
        country: r.country,
        locale: r.locale,
        source: r.source,
        ...emailInviteOutcome(r),
        sentAt: r.sentAt ? r.sentAt.toISOString() : null,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }
}
