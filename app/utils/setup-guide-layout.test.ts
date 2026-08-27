import { describe, expect, it } from "vitest";
import {
  SETUP_GUIDE_ANTI_SHIFT_SCRIPT,
  SETUP_GUIDE_COOKIE_NAME,
  SETUP_GUIDE_STORAGE_KEY,
  parseSetupGuideLayoutCookie,
  setupGuideCookieString,
  setupGuideLayoutFromPersisted,
} from "./setup-guide-layout";

describe("setupGuideLayoutFromPersisted", () => {
  it("stays open when nothing is stored", () => {
    expect(setupGuideLayoutFromPersisted(null)).toBe("open");
    expect(setupGuideLayoutFromPersisted({})).toBe("open");
  });

  it("hides only when every step is done and dismissed", () => {
    expect(
      setupGuideLayoutFromPersisted({
        dismissed: true,
        done: { portal: true, enroll: true, pos: true, titles: false },
      }),
    ).toBe("open");
    expect(
      setupGuideLayoutFromPersisted({
        dismissed: true,
        done: { portal: true, enroll: true, pos: true, titles: true },
      }),
    ).toBe("hidden");
  });

  it("collapses when the body was last closed", () => {
    expect(setupGuideLayoutFromPersisted({ collapsed: true })).toBe("collapsed");
  });
});

describe("parseSetupGuideLayoutCookie", () => {
  it("defaults to open", () => {
    expect(parseSetupGuideLayoutCookie(null)).toBe("open");
    expect(parseSetupGuideLayoutCookie("other=1")).toBe("open");
  });

  it("reads the layout cookie among other cookies", () => {
    expect(
      parseSetupGuideLayoutCookie(
        `sid=abc; ${SETUP_GUIDE_COOKIE_NAME}=hidden; theme=light`,
      ),
    ).toBe("hidden");
    expect(
      parseSetupGuideLayoutCookie(`${SETUP_GUIDE_COOKIE_NAME}=collapsed`),
    ).toBe("collapsed");
  });
});

describe("setupGuideCookieString", () => {
  it("writes a path-scoped cookie", () => {
    expect(setupGuideCookieString("hidden")).toContain(
      `${SETUP_GUIDE_COOKIE_NAME}=hidden`,
    );
    expect(setupGuideCookieString("hidden")).toContain("SameSite=Lax");
  });
});

describe("SETUP_GUIDE_ANTI_SHIFT_SCRIPT", () => {
  it("targets the same storage key the dashboard writes", () => {
    expect(SETUP_GUIDE_ANTI_SHIFT_SCRIPT).toContain(SETUP_GUIDE_STORAGE_KEY);
    expect(SETUP_GUIDE_ANTI_SHIFT_SCRIPT).toContain(SETUP_GUIDE_COOKIE_NAME);
  });
});
