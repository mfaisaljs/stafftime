import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useRouteError } from "react-router";
import { FileText, Plus } from "lucide-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  // Task lists are not persisted yet — always show the empty state.
  return { taskLists: [] as Array<{ id: string; name: string }> };
};

export default function TaskListsPage() {
  const { taskLists } = useLoaderData<typeof loader>();
  const isEmpty = taskLists.length === 0;

  return (
    <s-page heading="TaskLists" inlineSize="large">
      <s-button slot="primary-action" variant="primary">
        <span className="button-content">
          <Plus aria-hidden="true" size={14} />
          Create Task List
        </span>
      </s-button>

      {isEmpty ? (
        <section className="empty-card">
          <div className="empty-illustration" aria-hidden="true">
            <span className="empty-circle" />
            <FileText size={72} />
            <span className="empty-accent" />
          </div>
          <strong>Create your first task list</strong>
          <p>Start organizing tasks for your team and locations.</p>
          <s-button variant="primary">
            <span className="button-content">
              <Plus aria-hidden="true" size={13} />
              Create Task List
            </span>
          </s-button>
        </section>
      ) : null}

      <style>{TASKLISTS_STYLES}</style>
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

const TASKLISTS_STYLES = `
  .button-content {
    align-items: center;
    display: inline-flex;
    gap: 4px;
  }

  .empty-card {
    align-items: center;
    background: #fff;
    border: 1px solid #d9d9d9;
    border-radius: 12px;
    display: grid;
    gap: 8px;
    justify-items: center;
    min-height: 360px;
    padding: 56px 24px;
    text-align: center;
  }

  .empty-card strong {
    color: #202223;
    font-size: 16px;
  }

  .empty-card p {
    color: #616161;
    margin: 0 0 10px;
  }

  .empty-illustration {
    color: #c9c9c9;
    display: grid;
    margin-bottom: 12px;
    place-items: center;
    position: relative;
  }

  .empty-circle {
    background: #f1f1f1;
    border-radius: 999px;
    height: 120px;
    left: 50%;
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 120px;
    z-index: 0;
  }

  .empty-illustration svg {
    position: relative;
    z-index: 1;
  }

  .empty-accent {
    background: #f5b63b;
    border-radius: 2px;
    height: 20px;
    left: calc(50% - 28px);
    position: absolute;
    top: calc(50% - 28px);
    width: 20px;
    z-index: 2;
  }
`;
