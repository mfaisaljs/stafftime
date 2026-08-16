import { createHmac, timingSafeEqual } from "node:crypto";
import { shopFromDest } from "../utils/http.server";

/** Max stored data-URL length (~300KB binary after base64 overhead). */
const MAX_PHOTO_CHARS = 450_000;
const PHOTO_TTL_MS = 2 * 60 * 60 * 1000;

export type ClockPhotoKind = "in" | "out";

export function normalizeClockPhoto(
  photo?: string | null,
  mimeType?: string | null,
): string | undefined {
  if (photo == null) return undefined;
  const trimmed = String(photo).trim();
  if (!trimmed) return undefined;
  if (trimmed.length > MAX_PHOTO_CHARS) {
    throw new Error("Photo is too large. Please retake the selfie.");
  }

  if (trimmed.startsWith("data:image/")) {
    return trimmed;
  }

  const mime =
    typeof mimeType === "string" && mimeType.startsWith("image/")
      ? mimeType
      : "image/jpeg";
  return `data:${mime};base64,${trimmed}`;
}

export function requireClockPhoto(
  requirePhoto: boolean,
  photoUrl: string | undefined,
  actionLabel: "clock in" | "clock out",
) {
  if (!requirePhoto) return;
  if (!photoUrl) {
    throw new Error(`A selfie photo is required before ${actionLabel}.`);
  }
}

export function clockPhotoPath(input: {
  shopDomain: string;
  employeeId: string;
  timeEntryId: string;
  kind: ClockPhotoKind;
  now?: number;
}) {
  const expiresAt = (input.now ?? Date.now()) + PHOTO_TTL_MS;
  const sig = signClockPhotoAccess({ ...input, expiresAt });
  const query = new URLSearchParams({
    kind: input.kind,
    exp: String(expiresAt),
    sig,
  });
  return `/api/clock-photo/${input.timeEntryId}?${query}`;
}

export function verifyClockPhotoAccess(input: {
  shopDomain: string;
  employeeId: string;
  timeEntryId: string;
  kind: string;
  expiresAt: number;
  sig: string;
  now?: number;
}): input is {
  shopDomain: string;
  employeeId: string;
  timeEntryId: string;
  kind: ClockPhotoKind;
  expiresAt: number;
  sig: string;
  now?: number;
} {
  if (input.kind !== "in" && input.kind !== "out") return false;
  if (!Number.isFinite(input.expiresAt)) return false;
  if (input.expiresAt < (input.now ?? Date.now())) return false;
  const expected = signClockPhotoAccess({
    shopDomain: input.shopDomain,
    employeeId: input.employeeId,
    timeEntryId: input.timeEntryId,
    kind: input.kind,
    expiresAt: input.expiresAt,
  });
  return safeEqualHex(expected, input.sig);
}

export function decodeClockPhoto(photoUrl: string | null | undefined): {
  mime: string;
  body: Buffer;
} | null {
  if (!photoUrl) return null;
  let value = photoUrl.trim();
  if (!value) return null;

  // POS may send a data URL that was wrapped twice.
  if (value.startsWith("data:image/") && value.includes(";base64,data:image/")) {
    value = value.slice(value.indexOf(";base64,") + 8);
  }

  const dataUrl = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/i.exec(value);
  if (dataUrl) {
    const body = Buffer.from(dataUrl[2].replace(/\s/g, ""), "base64");
    if (!body.length) return null;
    return { mime: dataUrl[1].toLowerCase(), body };
  }

  if (/^[A-Za-z0-9+/=\s]+$/.test(value) && value.replace(/\s/g, "").length > 32) {
    const body = Buffer.from(value.replace(/\s/g, ""), "base64");
    if (!body.length) return null;
    return { mime: "image/jpeg", body };
  }

  return null;
}

function signClockPhotoAccess(input: {
  shopDomain: string;
  employeeId: string;
  timeEntryId: string;
  kind: ClockPhotoKind;
  expiresAt: number;
}) {
  const payload = [
    shopFromDest(input.shopDomain).toLowerCase(),
    input.employeeId,
    input.timeEntryId,
    input.kind,
    String(input.expiresAt),
  ].join(".");
  return createHmac("sha256", photoSigningSecret())
    .update(payload)
    .digest("hex");
}

function photoSigningSecret() {
  return process.env.SHOPIFY_API_SECRET || "clock-photo-dev-secret";
}

function safeEqualHex(left: string, right: string) {
  try {
    const a = Buffer.from(left, "hex");
    const b = Buffer.from(right, "hex");
    if (a.length === 0 || a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
