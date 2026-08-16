import { describe, expect, it } from "vitest";
import {
  clockPhotoPath,
  clockPhotosMatch,
  decodeClockPhoto,
  normalizeClockPhoto,
  verifyClockPhotoAccess,
} from "./clock-photo.server";

describe("decodeClockPhoto", () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const dataUrl = `data:image/jpeg;base64,${jpeg.toString("base64")}`;

  it("decodes a data URL from POS", () => {
    const decoded = decodeClockPhoto(dataUrl);
    expect(decoded?.mime).toBe("image/jpeg");
    expect(decoded?.body.equals(jpeg)).toBe(true);
  });

  it("unwraps a double-prefixed data URL", () => {
    const decoded = decodeClockPhoto(`data:image/jpeg;base64,${dataUrl}`);
    expect(decoded?.body.equals(jpeg)).toBe(true);
  });
});

describe("clock photo access", () => {
  it("accepts a fresh signed path", () => {
    const now = 1_700_000_000_000;
    const path = clockPhotoPath({
      shopDomain: "demo.myshopify.com",
      employeeId: "emp_1",
      timeEntryId: "entry_1",
      kind: "in",
      now,
    });
    const url = new URL(path, "https://app.example");
    expect(url.pathname).toBe("/api/clock-photo/entry_1/in");
    expect(
      verifyClockPhotoAccess({
        shopDomain: "demo.myshopify.com",
        employeeId: "emp_1",
        timeEntryId: "entry_1",
        kind: "in",
        expiresAt: Number(url.searchParams.get("exp")),
        sig: url.searchParams.get("sig") || "",
        now,
      }),
    ).toBe(true);
  });

  it("rejects an expired signature", () => {
    const now = 1_700_000_000_000;
    const path = clockPhotoPath({
      shopDomain: "demo.myshopify.com",
      employeeId: "emp_1",
      timeEntryId: "entry_1",
      kind: "out",
      now,
    });
    const url = new URL(path, "https://app.example");
    expect(
      verifyClockPhotoAccess({
        shopDomain: "demo.myshopify.com",
        employeeId: "emp_1",
        timeEntryId: "entry_1",
        kind: "out",
        expiresAt: Number(url.searchParams.get("exp")),
        sig: url.searchParams.get("sig") || "",
        now: now + 3 * 60 * 60 * 1000,
      }),
    ).toBe(false);
  });
});

describe("normalizeClockPhoto", () => {
  it("keeps POS data URLs intact", () => {
    const photo = "data:image/jpeg;base64,/9j/4AAQ";
    expect(normalizeClockPhoto(photo, "image/jpeg")).toBe(photo);
  });
});

describe("clockPhotosMatch", () => {
  it("detects identical clock-in and clock-out selfies", () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9, 0x01]);
    const photo = `data:image/jpeg;base64,${jpeg.toString("base64")}`;
    expect(clockPhotosMatch(photo, photo)).toBe(true);
    expect(
      clockPhotosMatch(photo, `data:image/jpeg;base64,${Buffer.from([1, 2, 3]).toString("base64")}`),
    ).toBe(false);
  });
});
