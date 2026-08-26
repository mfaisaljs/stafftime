import nodemailer from "nodemailer";
import { APP_DISPLAY_NAME } from "../utils/app-title";

type EmailConfig = {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  service?: string;
  secureConnection?: boolean;
  tls?: { rejectUnauthorized: boolean };
};

type EmailData = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

function escapeEmailHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function appDashboardUrl() {
  const base = process.env.SHOPIFY_APP_URL?.replace(/\/$/, "");
  return base ? `${base}/app` : "/app";
}

class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private isConfigured = false;

  constructor() {
    const emailConfig = this.getEmailConfig();
    if (emailConfig) {
      this.transporter = nodemailer.createTransport(emailConfig);
      this.isConfigured = true;
      return;
    }
    console.warn(
      "Email service not configured. Set EMAIL_HOST, EMAIL_USER, and EMAIL_PASS environment variables.",
    );
  }

  private getEmailConfig(): EmailConfig | null {
    const host = process.env.EMAIL_HOST;
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;
    const port = Number.parseInt(process.env.EMAIL_PORT || "587", 10);

    if (!host || !user || !pass) {
      return null;
    }

    return {
      service: "gmail",
      host,
      port,
      secure: true,
      secureConnection: false,
      tls: {
        rejectUnauthorized: false,
      },
      auth: { user, pass },
    };
  }

  private stripHtml(html: string) {
    return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  }

  async sendEmail(emailData: EmailData): Promise<boolean> {
    if (!this.isConfigured || !this.transporter) {
      console.warn("Email service not configured, skipping email send");
      return false;
    }

    try {
      const result = await this.transporter.sendMail({
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to: emailData.to,
        subject: emailData.subject,
        html: emailData.html,
        text: emailData.text || this.stripHtml(emailData.html),
      });
      console.log("Email sent successfully:", result.messageId);
      return true;
    } catch (error) {
      console.error("Failed to send email:", error);
      return false;
    }
  }

  async sendAppInstallationNotification(
    shopDomain: string,
    shopName?: string,
  ): Promise<boolean> {
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) {
      console.warn("ADMIN_EMAIL not configured, skipping installation notification");
      return false;
    }

    const safeDomain = escapeEmailHtml(shopDomain);
    const safeName = shopName ? escapeEmailHtml(shopName) : "";
    const subject = `🚀 New App Installation - ${APP_DISPLAY_NAME}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">🎉 New App Installation</h1>
          <p style="margin: 10px 0 0 0; opacity: 0.9;">${escapeEmailHtml(APP_DISPLAY_NAME)} has been installed on a new shop!</p>
        </div>

        <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
          <div style="margin-bottom: 20px;">
            <h2 style="color: #333; margin-bottom: 10px;">Shop Details</h2>
            <div style="background: white; padding: 20px; border-radius: 8px; border-left: 4px solid #667eea;">
              <p style="margin: 0;"><strong>Shop Domain:</strong> ${safeDomain}</p>
              ${safeName ? `<p style="margin: 10px 0 0 0;"><strong>Shop Name:</strong> ${safeName}</p>` : ""}
              <p style="margin: 10px 0 0 0;"><strong>Installation Date:</strong> ${new Date().toLocaleString()}</p>
            </div>
          </div>

          <div style="margin-bottom: 20px;">
            <h2 style="color: #333; margin-bottom: 10px;">What happens next?</h2>
            <ul style="color: #666; line-height: 1.6;">
              <li>The shop has been added to your database</li>
              <li>Default workforce settings and locations are ready</li>
              <li>The merchant can enroll staff and use POS clock-in</li>
              <li>You can monitor their usage in your dashboard</li>
            </ul>
          </div>

          <div style="text-align: center; margin-top: 30px;">
            <a href="${appDashboardUrl()}"
               style="background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              View Dashboard
            </a>
          </div>
        </div>

        <div style="text-align: center; margin-top: 20px; color: #999; font-size: 12px;">
          <p>This is an automated notification from ${escapeEmailHtml(APP_DISPLAY_NAME)}</p>
        </div>
      </div>
    `;

    return this.sendEmail({ to: adminEmail, subject, html });
  }

  async sendAppUninstallationNotification(
    shopDomain: string,
    shopName?: string,
  ): Promise<boolean> {
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) {
      console.warn("ADMIN_EMAIL not configured, skipping uninstallation notification");
      return false;
    }

    const safeDomain = escapeEmailHtml(shopDomain);
    const safeName = shopName ? escapeEmailHtml(shopName) : "";
    const subject = `⚠️ App Uninstallation - ${APP_DISPLAY_NAME}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">⚠️ App Uninstallation</h1>
          <p style="margin: 10px 0 0 0; opacity: 0.9;">${escapeEmailHtml(APP_DISPLAY_NAME)} has been uninstalled from a shop</p>
        </div>

        <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
          <div style="margin-bottom: 20px;">
            <h2 style="color: #333; margin-bottom: 10px;">Shop Details</h2>
            <div style="background: white; padding: 20px; border-radius: 8px; border-left: 4px solid #ff6b6b;">
              <p style="margin: 0;"><strong>Shop Domain:</strong> ${safeDomain}</p>
              ${safeName ? `<p style="margin: 10px 0 0 0;"><strong>Shop Name:</strong> ${safeName}</p>` : ""}
              <p style="margin: 10px 0 0 0;"><strong>Uninstallation Date:</strong> ${new Date().toLocaleString()}</p>
            </div>
          </div>

          <div style="margin-bottom: 20px;">
            <h2 style="color: #333; margin-bottom: 10px;">What happened?</h2>
            <ul style="color: #666; line-height: 1.6;">
              <li>The shop session has been removed from your database</li>
              <li>All associated workforce data has been cleaned up</li>
              <li>Staff, schedules, and payroll records for the shop were deleted</li>
              <li>The shop is no longer active in your system</li>
            </ul>
          </div>

          <div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; padding: 15px; margin-bottom: 20px;">
            <h3 style="margin: 0 0 10px 0; color: #856404;">💡 Follow-up Action</h3>
            <p style="margin: 0; color: #856404;">
              Consider reaching out to understand why they uninstalled and if there's anything you can do to help.
            </p>
          </div>

          <div style="text-align: center; margin-top: 30px;">
            <a href="${appDashboardUrl()}"
               style="background: #ff6b6b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              View Dashboard
            </a>
          </div>
        </div>

        <div style="text-align: center; margin-top: 20px; color: #999; font-size: 12px;">
          <p>This is an automated notification from ${escapeEmailHtml(APP_DISPLAY_NAME)}</p>
        </div>
      </div>
    `;

    return this.sendEmail({ to: adminEmail, subject, html });
  }

  async sendAppChargeAcceptedNotification(
    shopDomain: string,
    shopName?: string,
    planName?: string,
    planPrice?: number,
  ): Promise<boolean> {
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) {
      console.warn("ADMIN_EMAIL not configured, skipping charge accepted notification");
      return false;
    }

    const planLabel =
      planName != null && planPrice != null
        ? ` - ${planName} ($${planPrice}/mo)`
        : planName != null
          ? ` - ${planName}`
          : planPrice != null
            ? ` - $${planPrice}/mo`
            : "";
    const safeDomain = escapeEmailHtml(shopDomain);
    const safeName = shopName ? escapeEmailHtml(shopName) : "";
    const planDetail =
      planName != null || planPrice != null
        ? `<p style="margin: 10px 0 0 0;"><strong>Plan:</strong> ${escapeEmailHtml(planName ?? "—")}${planPrice != null ? ` — $${planPrice}/month` : ""}</p>`
        : "";
    const subject = `✅ App Charge Accepted - ${APP_DISPLAY_NAME}${planLabel}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">✅ App Charge Accepted</h1>
          <p style="margin: 10px 0 0 0; opacity: 0.9;">A merchant has approved the ${escapeEmailHtml(APP_DISPLAY_NAME)} subscription.</p>
        </div>

        <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
          <div style="margin-bottom: 20px;">
            <h2 style="color: #333; margin-bottom: 10px;">Shop Details</h2>
            <div style="background: white; padding: 20px; border-radius: 8px; border-left: 4px solid #10b981;">
              <p style="margin: 0;"><strong>Shop Domain:</strong> ${safeDomain}</p>
              ${safeName ? `<p style="margin: 10px 0 0 0;"><strong>Shop Name:</strong> ${safeName}</p>` : ""}
              ${planDetail}
              <p style="margin: 10px 0 0 0;"><strong>Accepted Date:</strong> ${new Date().toLocaleString()}</p>
            </div>
          </div>

          <div style="text-align: center; margin-top: 30px;">
            <a href="${appDashboardUrl()}"
               style="background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              View Dashboard
            </a>
          </div>
        </div>

        <div style="text-align: center; margin-top: 20px; color: #999; font-size: 12px;">
          <p>This is an automated notification from ${escapeEmailHtml(APP_DISPLAY_NAME)}</p>
        </div>
      </div>
    `;

    return this.sendEmail({ to: adminEmail, subject, html });
  }
}

export const emailService = new EmailService();
