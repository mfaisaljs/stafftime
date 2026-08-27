import { afterEach, describe, expect, it, vi } from "vitest";
import { emailService } from "./email.server";

describe("emailService lifecycle notifications", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("skips install email when ADMIN_EMAIL is not configured", async () => {
    vi.stubEnv("ADMIN_EMAIL", "");
    const sendSpy = vi
      .spyOn(emailService, "sendEmail")
      .mockResolvedValue(true);

    const sent = await emailService.sendAppInstallationNotification(
      "demo.myshopify.com",
      "Demo Shop",
    );

    expect(sent).toBe(false);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("uses TruBuild-style emojis in install subject", async () => {
    vi.stubEnv("ADMIN_EMAIL", "admin@example.com");
    const sendSpy = vi
      .spyOn(emailService, "sendEmail")
      .mockResolvedValue(true);

    await emailService.sendAppInstallationNotification(
      "demo.myshopify.com",
      "Demo Shop",
    );

    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.stringMatching(/^🚀 New App Installation/),
        html: expect.stringContaining("🎉 New App Installation"),
      }),
    );
  });

  it("uses TruBuild-style emojis in uninstall subject", async () => {
    vi.stubEnv("ADMIN_EMAIL", "admin@example.com");
    const sendSpy = vi
      .spyOn(emailService, "sendEmail")
      .mockResolvedValue(true);

    await emailService.sendAppUninstallationNotification(
      "demo.myshopify.com",
      "Demo Shop",
    );

    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.stringMatching(/^⚠️ App Uninstallation/),
        html: expect.stringMatching(/⚠️ App Uninstallation[\s\S]*💡 Follow-up Action/),
      }),
    );
  });

  it("uses TruBuild-style emojis in charge accepted subject", async () => {
    vi.stubEnv("ADMIN_EMAIL", "admin@example.com");
    const sendSpy = vi
      .spyOn(emailService, "sendEmail")
      .mockResolvedValue(true);

    await emailService.sendAppChargeAcceptedNotification(
      "demo.myshopify.com",
      "Demo Shop",
      "Small Business",
      19.99,
    );

    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.stringMatching(/^✅ App Charge Accepted/),
        html: expect.stringContaining("✅ App Charge Accepted"),
      }),
    );
  });
});

describe("emailService.sendApplicationCrashReport", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const crashInput = (message: string) => ({
    source: "server" as const,
    shopDomain: "demo.myshopify.com",
    storeName: "demo",
    route: "/app/staff",
    fullUrl: "https://app.example/app/staff?shop=demo.myshopify.com",
    method: "GET",
    errorName: "TypeError",
    message,
    stack: "TypeError: boom\n    at loader (app/routes/app.staff.tsx:10:5)",
  });

  it("skips crash email when ADMIN_EMAIL is not configured", async () => {
    vi.stubEnv("ADMIN_EMAIL", "");
    const sendSpy = vi.spyOn(emailService, "sendEmail").mockResolvedValue(true);

    const sent = await emailService.sendApplicationCrashReport(
      crashInput(`missing-admin-${Date.now()}`),
    );

    expect(sent).toBe(false);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("skips crash email when CRASH_REPORT_EMAIL is false", async () => {
    vi.stubEnv("ADMIN_EMAIL", "admin@example.com");
    vi.stubEnv("CRASH_REPORT_EMAIL", "false");
    const sendSpy = vi.spyOn(emailService, "sendEmail").mockResolvedValue(true);

    const sent = await emailService.sendApplicationCrashReport(
      crashInput(`disabled-${Date.now()}`),
    );

    expect(sent).toBe(false);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("does not email suppressed React hydration errors", async () => {
    vi.stubEnv("ADMIN_EMAIL", "admin@example.com");
    const sendSpy = vi.spyOn(emailService, "sendEmail").mockResolvedValue(true);

    const sent = await emailService.sendApplicationCrashReport(
      crashInput("Minified React error #418"),
    );

    expect(sent).toBe(true);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("emails full error details including stack trace", async () => {
    vi.stubEnv("ADMIN_EMAIL", "admin@example.com");
    const sendSpy = vi.spyOn(emailService, "sendEmail").mockResolvedValue(true);
    const message = `cannot read pin ${Date.now()}`;

    const sent = await emailService.sendApplicationCrashReport(crashInput(message));

    expect(sent).toBe(true);
    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.stringMatching(/^🚨 App crash: demo — TypeError/),
        html: expect.stringMatching(
          /Application error[\s\S]*demo\.myshopify\.com[\s\S]*\/app\/staff[\s\S]*cannot read pin[\s\S]*at loader/,
        ),
      }),
    );
  });

  it("dedupes the same crash within two minutes", async () => {
    vi.stubEnv("ADMIN_EMAIL", "admin@example.com");
    const sendSpy = vi.spyOn(emailService, "sendEmail").mockResolvedValue(true);
    const input = crashInput(`dedupe-${Date.now()}`);

    await emailService.sendApplicationCrashReport(input);
    await emailService.sendApplicationCrashReport(input);

    expect(sendSpy).toHaveBeenCalledTimes(1);
  });
});
