import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useNavigate, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { FileText, Plus } from "lucide-react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function CommissionPrograms() {
  const navigate = useNavigate();

  return (
    <s-page heading="Commission Programs" inlineSize="large">
      <div className="commission-page">
        <div className="commission-header">
          <h1>Commission Programs</h1>
          <s-button
            variant="primary"
            onClick={() => navigate("/app/commission-programs/new")}
          >
            <span className="button-content">
              <Plus aria-hidden="true" size={14} />
              Create Program
            </span>
          </s-button>
        </div>

        <div className="commission-banner">
          <div className="banner-title">
            <span aria-hidden="true">ⓘ</span>
            <strong>Assign commission programs in Shopify POS</strong>
            <button type="button" aria-label="Dismiss banner">
              ×
            </button>
          </div>
          <p>
            You can assign commission program to your staff during order or after order
            in Shopify POS.
          </p>
          <div className="banner-action">
            <s-button variant="secondary">Learn More</s-button>
          </div>
        </div>

        <section className="empty-card">
          <div className="empty-illustration" aria-hidden="true">
            <FileText size={72} />
            <span />
          </div>
          <strong>Create your first commission program</strong>
          <p>Start managing commission programs for your staff members.</p>
          <s-button
            variant="primary"
            onClick={() => navigate("/app/commission-programs/new")}
          >
            <span className="button-content">
              <Plus aria-hidden="true" size={13} />
              Create Program
            </span>
          </s-button>
        </section>
      </div>

      <style>{COMMISSION_STYLES}</style>
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

const COMMISSION_STYLES = `
  .commission-page {
    display: grid;
    gap: 22px;
  }

  .commission-header {
    align-items: center;
    display: flex;
    justify-content: space-between;
  }

  .commission-header h1 {
    font-size: 18px;
    margin: 0;
  }

  .button-content {
    align-items: center;
    display: inline-flex;
    gap: 6px;
  }

  .commission-banner {
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

  .commission-banner p {
    color: #616161;
    margin: 14px 12px 10px;
  }

  .banner-action {
    padding: 0 12px 14px;
  }

  .empty-card {
    align-items: center;
    background: #fff;
    border: 1px solid #d9d9d9;
    border-radius: 8px;
    display: grid;
    gap: 8px;
    justify-items: center;
    min-height: 330px;
    padding: 48px 24px;
    text-align: center;
  }

  .empty-card p {
    color: #616161;
    margin: 0 0 8px;
  }

  .empty-illustration {
    color: #d8d8d8;
    display: grid;
    margin-bottom: 10px;
    place-items: center;
    position: relative;
  }

  .empty-illustration span {
    background: #f5b63b;
    border-radius: 2px;
    height: 20px;
    left: 20px;
    position: absolute;
    top: 14px;
    width: 20px;
  }
`;
