import { describe, expect, it } from "vitest";
import { isSuppressedApplicationCrashMessage } from "./crash-report-suppression";

describe("isSuppressedApplicationCrashMessage", () => {
  it("suppresses React hydration mismatch codes including #425", () => {
    expect(
      isSuppressedApplicationCrashMessage(
        "Minified React error #425; visit https://reactjs.org/docs/error-decoder.html?invariant=425",
      ),
    ).toBe(true);
    expect(isSuppressedApplicationCrashMessage("Minified React error #418")).toBe(
      true,
    );
    expect(isSuppressedApplicationCrashMessage("Minified React error #423")).toBe(
      true,
    );
  });

  it("does not suppress unrelated errors", () => {
    expect(
      isSuppressedApplicationCrashMessage(
        "TypeError: Cannot read properties of null",
      ),
    ).toBe(false);
  });
});
