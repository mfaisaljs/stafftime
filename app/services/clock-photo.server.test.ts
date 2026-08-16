import { describe, expect, it } from "vitest";
import {
  clockPhotoResponse,
  decodeClockPhotoDataUrl,
  normalizeClockPhoto,
} from "./clock-photo.server";

const SAMPLE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("clock-photo.server", () => {
  it("normalizes raw base64 into a data URL", () => {
    expect(normalizeClockPhoto(SAMPLE_PNG_BASE64, "image/png")).toBe(
      `data:image/png;base64,${SAMPLE_PNG_BASE64}`,
    );
  });

  it("decodes stored data URLs for image responses", () => {
    const dataUrl = `data:image/png;base64,${SAMPLE_PNG_BASE64}`;
    const decoded = decodeClockPhotoDataUrl(dataUrl);
    expect(decoded?.mime).toBe("image/png");
    expect(decoded?.bytes.byteLength).toBeGreaterThan(0);

    const response = clockPhotoResponse(dataUrl);
    expect(response.headers.get("Content-Type")).toBe("image/png");
  });
});
