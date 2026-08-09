import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData, useRouteError, useSearchParams } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { FileText, Plus } from "lucide-react";
import { authenticate } from "../shopify.server";
import { getAdminShop } from "../services/admin.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getAdminShop(session);
  const programs = await prisma.commissionProgram.findMany({
    where: { shopId: shop.id },
    orderBy: { createdAt: "desc" },
  });

  return {
    programs: programs.map((program) => ({
      id: program.id,
      name: program.name,
      commissionType: program.commissionType,
      productScope: program.productScope,
      staffCount: parseJsonArray(program.employeeIds).length,
      productCount:
        program.productScope === "all"
          ? null
          : parseJsonArray(program.productCommissions).length,
    })),
  };
};

export default function CommissionProgramsIndex() {
  const { programs } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const created = searchParams.get("created") === "1";

  return (
    <s-page heading="Commission Program">
      <div className="commission-page">
        {created && (
          <s-banner tone="success" heading="Commission program created." />
        )}

        <div className="commission-header">
          <Link className="button-link" to="/app/commission-programs/new">
            <s-button variant="primary">
              <span className="button-content">
                <Plus aria-hidden="true" size={14} />
                Create Program
              </span>
            </s-button>
          </Link>
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

        {programs.length === 0 ? (
          <section className="empty-card">
            <div className="empty-illustration" aria-hidden="true">
              <FileText size={72} />
              <span />
            </div>
            <strong>Create your first commission program</strong>
            <p>Start managing commission programs for your staff members.</p>
            <Link className="button-link" to="/app/commission-programs/new">
              <s-button variant="primary">
                <span className="button-content">
                  <Plus aria-hidden="true" size={13} />
                  Create Program
                </span>
              </s-button>
            </Link>
          </section>
        ) : (
          <section className="programs-card">
            <div className="programs-header">
              <strong>Commission Programs</strong>
              <span>{programs.length} program{programs.length === 1 ? "" : "s"}</span>
            </div>
            <div className="programs-list">
              {programs.map((program) => (
                <div className="program-row" key={program.id}>
                  <div>
                    <strong>{program.name}</strong>
                    <span>
                      {program.commissionType === "percentage"
                        ? "Percentage"
                        : "Fixed Amount"}{" "}
                      · {program.staffCount} staff ·{" "}
                      {program.productScope === "all"
                        ? "All products"
                        : `${program.productCount ?? 0} products`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <style>{COMMISSION_STYLES}</style>
    </s-page>
  );
}

function parseJsonArray(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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
    justify-content: flex-end;
  }

  .button-content {
    align-items: center;
    display: inline-flex;
    gap: 6px;
  }

  .button-link {
    display: inline-flex;
    text-decoration: none;
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

  .empty-card,
  .programs-card {
    background: #fff;
    border: 1px solid #d9d9d9;
    border-radius: 8px;
  }

  .empty-card {
    align-items: center;
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

  .programs-header {
    align-items: center;
    border-bottom: 1px solid #ececec;
    display: flex;
    justify-content: space-between;
    padding: 14px 16px;
  }

  .programs-header span,
  .program-row span {
    color: #616161;
  }

  .program-row {
    border-bottom: 1px solid #ececec;
    display: grid;
    gap: 4px;
    padding: 14px 16px;
  }

  .program-row:last-child {
    border-bottom: 0;
  }

  .program-row strong,
  .program-row span {
    display: block;
  }
`;
