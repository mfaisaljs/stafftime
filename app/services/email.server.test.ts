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
