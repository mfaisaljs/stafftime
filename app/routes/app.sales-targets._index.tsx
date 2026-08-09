import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData, useRouteError } from "react-router";
import { useState } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopHandle = session.shop.replace(/\.myshopify\.com$/i, "");
  const posEditorUrl = `https://admin.shopify.com/store/${shopHandle}/apps/point-of-sale-channel/editor`;

  // Targets persistence lands in a follow-up; empty list for the initial route.
  return {
    targets: [] as Array<{ id: string }>,
    posEditorUrl,
    appName: "Trubuild: Staff Management",
  };
};

export default function SalesTargetsIndex() {
  const { targets, posEditorUrl, appName } = useLoaderData<typeof loader>();
  const [bannerDismissed, setBannerDismissed] = useState(false);

  return (
    <s-page heading="Sales Targets" inlineSize="large">
      <div className="sales-targets-page">
        {!bannerDismissed && (
          <div className="sales-targets-banner">
            <div className="banner-title">
              <span aria-hidden="true">ⓘ</span>
              <strong>Set up Sales Targets on your POS</strong>
              <button
                type="button"
                aria-label="Dismiss banner"
                onClick={() => setBannerDismissed(true)}
              >
                ×
              </button>
            </div>
            <div className="banner-body">
              <p>
                <strong>1) Add the Sales Targets tile</strong>
                <br />
                In the POS editor, tap Add tile → {appName} → Sales Targets, then
                save. Staff can tap the tile and enter their PIN to see monthly
                progress.
              </p>
              <p>
                <strong>2) Turn on the extension</strong>
                <br />
                In the POS editor, open Apps, find Sales Targets, and turn it on.
                This adds it to Order details and Post-purchase so staff can
                attribute sales to themselves.
              </p>
              <p className="banner-note">
                Don&apos;t see it? Make sure the latest app version is released and
                turn off any active dev preview, then reopen POS.
              </p>
              <div className="banner-action">
                <s-button variant="secondary" href={posEditorUrl} target="_blank">
                  Open POS editor
                </s-button>
              </div>
            </div>
          </div>
        )}

        {targets.length === 0 ? (
          <section className="empty-card">
            <strong>No sales targets yet</strong>
            <p>
              Create a monthly target for a staff member at a location to start
              tracking progress. Sales are credited when a sale is assigned to the
              staff member at POS.
            </p>
            <Link className="button-link" to="/app/sales-targets/new">
              <s-button variant="primary">Set target</s-button>
            </Link>
          </section>
        ) : null}
      </div>

      <style>{SALES_TARGETS_STYLES}</style>
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

const SALES_TARGETS_STYLES = `
  .sales-targets-page {
    display: grid;
    gap: 22px;
  }

  .sales-targets-banner {
    background: #fff;
    border: 1px solid #d9d9d9;
    border-radius: 8px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
    overflow: hidden;
  }

  .banner-title {
    align-items: center;
    background: #8ed0fb;
    display: flex;
    gap: 8px;
    padding: 9px 12px;
  }

  .banner-title button {
    background: transparent;
    border: 0;
    cursor: pointer;
    font-size: 18px;
    margin-left: auto;
  }

  .banner-body {
    display: grid;
    gap: 14px;
    padding: 16px 14px 14px;
  }

  .banner-body p {
    color: #303030;
    line-height: 1.45;
    margin: 0;
  }

  .banner-note {
    color: #616161 !important;
    font-size: 13px;
  }

  .banner-action {
    padding-top: 2px;
  }

  .empty-card {
    align-items: center;
    background: #fff;
    border: 1px solid #d9d9d9;
    border-radius: 8px;
    display: grid;
    gap: 10px;
    justify-items: center;
    min-height: 280px;
    padding: 48px 32px;
    text-align: center;
  }

  .empty-card strong {
    font-size: 16px;
  }

  .empty-card p {
    color: #616161;
    line-height: 1.45;
    margin: 0 0 8px;
    max-width: 520px;
  }

  .button-link {
    display: inline-flex;
    text-decoration: none;
  }
`;
