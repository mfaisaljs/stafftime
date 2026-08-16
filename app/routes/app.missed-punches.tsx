import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, useLoaderData } from "react-router";
import { AppPage } from "../components/AppPage";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getMissedPunches } from "../services/admin.server";
import { reviewMissedPunch } from "../services/workforce.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return getMissedPunches(session);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const requestId = String(formData.get("requestId") ?? "");
  const status = String(formData.get("status") ?? "") as "APPROVED" | "REJECTED";
  const reviewNotes = String(formData.get("reviewNotes") ?? "");

  await reviewMissedPunch({
    shopDomain: session.shop,
    requestId,
    status,
    reviewedBy: "manager",
    reviewNotes: reviewNotes || undefined,
  });

  return null;
};

export default function MissedPunchesPage() {
  const requests = useLoaderData<typeof loader>();

  return (
    <AppPage heading="Missed Punch Approvals" inlineSize="large">
      <s-section heading="Pending and recent requests">
        <s-stack direction="block" gap="base">
          {requests.length === 0 ? (
            <s-text>No missed punch requests yet.</s-text>
          ) : (
            requests.map((request) => (
              <s-box key={request.id} padding="base" background="subdued">
                <s-stack direction="block" gap="base">
                  <s-text>
                    {request.employee.firstName} {request.employee.lastName} ·{" "}
                    {request.type.replace("_", " ")} ·{" "}
                    {request.requestedAt.toLocaleString()} · {request.status}
                  </s-text>
                  {request.reason && <s-text>Reason: {request.reason}</s-text>}
                  {request.status === "PENDING" && (
                    <Form method="post">
                      <input type="hidden" name="requestId" value={request.id} />
                      <s-stack direction="inline" gap="base">
                        <input type="hidden" name="status" value="APPROVED" />
                        <s-button type="submit" variant="primary">
                          Approve
                        </s-button>
                      </s-stack>
                    </Form>
                  )}
                  {request.status === "PENDING" && (
                    <Form method="post">
                      <input type="hidden" name="requestId" value={request.id} />
                      <input type="hidden" name="status" value="REJECTED" />
                      <s-button type="submit" variant="secondary">
                        Reject
                      </s-button>
                    </Form>
                  )}
                </s-stack>
              </s-box>
            ))
          )}
        </s-stack>
      </s-section>
    </AppPage>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
