import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function NewSalesTargetPage() {
  return (
    <s-page heading="Set Sales Target" inlineSize="large">
      <s-section>
        <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
          <div style={{ display: "grid", gap: 12 }}>
            <s-heading>Set a monthly sales target</s-heading>
            <s-paragraph color="subdued">
              Choose a staff member, location, and monthly goal. Full target
              setup form is next — this page is ready for that form.
            </s-paragraph>
            <div>
              <Link to="/app/sales-targets" style={{ textDecoration: "none" }}>
                <s-button variant="secondary">Back to Sales Targets</s-button>
              </Link>
            </div>
          </div>
        </s-box>
      </s-section>
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
