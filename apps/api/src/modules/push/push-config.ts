/**
 * FIREBASE_SERVICE_ACCOUNT_JSON reading (push notifications, 2026-10-14).
 *
 * Same idea as GEMINI_SERVICE_ACCOUNT_JSON (`modules/ai/ai.config.ts`): the
 * whole service account key file goes into one env value. Here it may also be
 * the base64 of that file (some dashboards mangle multi-line values). Unlike
 * the AI config a bad value never throws: push is optional, the API boots
 * without it. Nothing here ever logs or returns the raw value.
 */

export interface FirebaseServiceAccount {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

export type FirebaseServiceAccountResult =
  | { status: "ok"; account: FirebaseServiceAccount }
  | { status: "missing" }
  | { status: "invalid"; reason: string };

export const FIREBASE_SERVICE_ACCOUNT_ENV = "FIREBASE_SERVICE_ACCOUNT_JSON";

const PEM_HEADER = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;
const BASE64 = /^[A-Za-z0-9+/_\-\s]+={0,2}\s*$/;

function decodeJsonText(raw: string): string | null {
  if (raw.startsWith("{")) return raw;
  if (!BASE64.test(raw)) return null;
  const decoded = Buffer.from(raw.replace(/\s+/g, ""), "base64").toString("utf8").trim();
  return decoded.startsWith("{") ? decoded : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/**
 * Raw env value -> credentials. `reason` is a short fixed English phrase for
 * the boot log line (never a fragment of the value).
 */
export function parseFirebaseServiceAccount(
  value: unknown,
): FirebaseServiceAccountResult {
  const raw = typeof value === "string" ? value.trim() : "";
  if (raw === "") return { status: "missing" };

  const text = decodeJsonText(raw);
  if (text === null) {
    return { status: "invalid", reason: "not JSON and not base64 of JSON" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { status: "invalid", reason: "JSON does not parse" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { status: "invalid", reason: "JSON is not an object" };
  }
  const cred = parsed as Record<string, unknown>;
  if (cred.type !== undefined && cred.type !== "service_account") {
    return { status: "invalid", reason: "type is not service_account" };
  }
  const projectId = str(cred.project_id);
  const clientEmail = str(cred.client_email);
  // A key pasted through a single-line field may carry literal "\n".
  const privateKey = str(cred.private_key)?.replace(/\\n/g, "\n") ?? null;
  if (!projectId || !clientEmail || !privateKey) {
    return {
      status: "invalid",
      reason: "project_id, client_email or private_key is missing",
    };
  }
  if (!PEM_HEADER.test(privateKey)) {
    return { status: "invalid", reason: "private_key is not a PEM key" };
  }
  return { status: "ok", account: { projectId, clientEmail, privateKey } };
}
