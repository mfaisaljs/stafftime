import { describe, expect, it } from "vitest";
import { APP_DISPLAY_NAME, appPageHeading } from "./app-title";

describe("appPageHeading", () => {
  it("prefixes the route name with the app display name", () => {
    expect(appPageHeading("Dashboard")).toBe(
      `${APP_DISPLAY_NAME} - Dashboard`,
    );
  });

  it("does not double-prefix an already formatted heading", () => {
    expect(appPageHeading(`${APP_DISPLAY_NAME} - Pricing`)).toBe(
      `${APP_DISPLAY_NAME} - Pricing`,
    );
  });
});
