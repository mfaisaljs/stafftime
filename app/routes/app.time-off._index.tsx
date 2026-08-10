import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import type { ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ArrowUpDown, Search } from "lucide-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

type StatusTab = "all" | "approved" | "pending" | "declined";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return { timeOffs: [] as Array<{ id: string }> };
};

export default function TimeOffIndexPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const tab = statusTab(searchParams.get("status"));

  return (
    <s-page heading="Time Off Management" inlineSize="large">
      <s-button
        slot="secondary-actions"
        type="button"
        variant="secondary"
        onClick={() => navigate("/app/time-off/policy")}
      >
        View Policy
      </s-button>
      <s-button
        slot="primary-action"
        type="button"
        variant="primary"
        onClick={() => navigate("/app/time-off/new")}
      >
        Create Time Off
      </s-button>

      <section className="timeoff-card">
        <div className="timeoff-toolbar">
          <nav className="timeoff-tabs" aria-label="Time off status filters">
            <StatusTabLink status="all" active={tab} searchParams={searchParams}>
              All
            </StatusTabLink>
            <StatusTabLink
              status="approved"
              active={tab}
              searchParams={searchParams}
            >
              Approved
            </StatusTabLink>
            <StatusTabLink
              status="pending"
              active={tab}
              searchParams={searchParams}
            >
              Pending
            </StatusTabLink>
            <StatusTabLink
              status="declined"
              active={tab}
              searchParams={searchParams}
            >
              Declined
            </StatusTabLink>
          </nav>

          <div className="timeoff-actions">
            <button
              type="button"
              className="icon-button"
              aria-label="Search and filter"
            >
              <Search aria-hidden="true" size={16} />
              <span className="filter-lines" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            </button>
            <button type="button" className="icon-button" aria-label="Sort">
              <ArrowUpDown aria-hidden="true" size={16} />
            </button>
          </div>
        </div>

        <div className="timeoff-empty">
          <Search aria-hidden="true" size={56} strokeWidth={1.25} />
          <strong>No Time Offs found</strong>
          <p>Try changing the filters or search term</p>
        </div>
      </section>

      <p className="knowledge-link">
        For more guidance, visit our <Link to="/app">Knowledge Base</Link>
      </p>

      <style>{TIME_OFF_STYLES}</style>
    </s-page>
  );
}

function StatusTabLink({
  status,
  active,
  searchParams,
  children,
}: {
  status: StatusTab;
  active: StatusTab;
  searchParams: URLSearchParams;
  children: ReactNode;
}) {
  const next = new URLSearchParams(searchParams);
  if (status === "all") {
    next.delete("status");
  } else {
    next.set("status", status);
  }
  const query = next.toString();
  const href = query ? `/app/time-off?${query}` : "/app/time-off";

  return (
    <Link
      className={`timeoff-tab${status === active ? " active" : ""}`}
      to={href}
    >
      {children}
    </Link>
  );
}

function statusTab(value: string | null): StatusTab {
  if (value === "approved" || value === "pending" || value === "declined") {
    return value;
  }
  return "all";
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

const TIME_OFF_STYLES = `
  .timeoff-card {
    background: #fff;
    border: 1px solid #e3e3e3;
    border-radius: 12px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
    display: grid;
    min-height: 420px;
    min-width: 0;
    overflow: hidden;
  }

  .timeoff-toolbar {
    align-items: center;
    border-bottom: 1px solid #ebebeb;
    display: flex;
    gap: 12px;
    justify-content: space-between;
    padding: 12px 14px;
  }

  .timeoff-tabs {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .timeoff-tab {
    border-radius: 8px;
    color: #303030;
    padding: 8px 14px;
    text-decoration: none;
  }

  .timeoff-tab.active {
    background: #e3e3e3;
    font-weight: 650;
  }

  .timeoff-actions {
    align-items: center;
    display: inline-flex;
    gap: 8px;
  }

  .icon-button {
    align-items: center;
    background: #fff;
    border: 1px solid #d4d4d4;
    border-radius: 8px;
    color: #303030;
    cursor: pointer;
    display: inline-flex;
    gap: 6px;
    height: 36px;
    justify-content: center;
    min-width: 36px;
    padding: 0 10px;
  }

  .icon-button:hover {
    background: #f7f7f7;
  }

  .filter-lines {
    display: grid;
    gap: 2px;
    width: 12px;
  }

  .filter-lines span {
    background: #303030;
    border-radius: 999px;
    display: block;
    height: 1.5px;
  }

  .filter-lines span:nth-child(1) {
    width: 100%;
  }

  .filter-lines span:nth-child(2) {
    width: 70%;
  }

  .filter-lines span:nth-child(3) {
    width: 40%;
  }

  .timeoff-empty {
    align-content: center;
    color: #616161;
    display: grid;
    gap: 8px;
    justify-items: center;
    padding: 72px 24px;
    text-align: center;
  }

  .timeoff-empty svg {
    color: #b5b5b5;
    margin-bottom: 8px;
  }

  .timeoff-empty strong {
    color: #303030;
    font-size: 18px;
    font-weight: 700;
  }

  .timeoff-empty p {
    color: #616161;
    font-size: 14px;
    margin: 0;
  }

  .knowledge-link {
    color: #616161;
    font-size: 13px;
    margin: 18px 0 0;
    text-align: center;
  }

  .knowledge-link a {
    color: #005bd3;
    text-decoration: underline;
  }
`;
