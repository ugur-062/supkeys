import * as invitePolicy from "../../src/common/company/external-invite-policy";

/**
 * SEND WINDOW OUT OF THE TEST (AUTO-HOURS-1, 2026-10-09).
 *
 * The dispatcher re-checks the recipient's business hours at SEND time: a
 * letter to an address the AI found (`AI_FORM`, `AI_AUTO`) leaves only on a
 * weekday between 09:00 and 16:00 in the recipient's country. Setting
 * `sendAfter` into the past (the `makeDue()` helpers) no longer takes the
 * window out of a test - a suite that dispatches AI rows with the real clock
 * would pass during Istanbul office hours and fail in the evening and at the
 * weekend.
 *
 * A suite that tests ANOTHER rule (digest, 7-day hold, cap, cancellation...)
 * calls this once at the top of the file: the send-time window is held open
 * for every test of the file. The queue-time window (`inviteExternalForListing`)
 * and the resume path keep the real rule. The window itself is covered with a
 * fixed clock in `invite-send-window.spec.ts`; that file must NOT call this.
 */
export function holdInviteSendWindowOpen(): void {
  let spy: jest.SpyInstance | undefined;
  beforeEach(() => {
    spy = jest.spyOn(invitePolicy, "coldInviteSendAt").mockImplementation((p) => p.at);
  });
  afterEach(() => {
    spy?.mockRestore();
  });
}
