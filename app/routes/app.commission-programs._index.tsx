import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import {
  useFetcher,
  useLoaderData,
  useSearchParams,
} from "react-router";
import { AppPage } from "../components/AppPage";
import { AppLink } from "../components/AppLink";
import { AppErrorBoundary } from "../components/AppErrorBoundary";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { FileText, Plus, Tag, ToggleRight, Type, User, Users } from "lucide-react";
import { authenticate } from "../shopify.server";
import { useQueryParamToast } from "../hooks/useQueryParamToast";
import { useAppNavigate } from "../hooks/useAppNavigate";
import prisma from "../db.server";

type ProgramRow = {
  id: string;
  name: string;
  commissionType: string;
  productScope: string;
  productCommissions: string;
  employeeIds: string;
  active: boolean;
};

function parseJsonArray(raw: string): unknown[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseIds(raw: string): string[] {
  return parseJsonArray(raw).filter((v): v is string => typeof v === "string");
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await prisma.shop.findUnique({ where: { domain: session.shop } });
  if (!shop) return { programs: [] as ProgramRow[] };

  const programs = await prisma.commissionProgram.findMany({
    where: { shopId: shop.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      commissionType: true,
      productScope: true,
      productCommissions: true,
      employeeIds: true,
      active: true,
    },
  });

  return { programs };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await prisma.shop.findUnique({ where: { domain: session.shop } });
  if (!shop) return { ok: false };

  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");
  if (intent !== "toggleActive") return { ok: false };

  const id = String(formData.get("id") || "");
  const active = String(formData.get("active") || "") === "true";
  if (!id) return { ok: false };

  await prisma.commissionProgram.updateMany({
    where: { id, shopId: shop.id },
    data: { active },
  });

  return { ok: true };
};

export default function CommissionProgramsIndex() {
  const { programs } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const fetcher = useFetcher();
  const navigate = useAppNavigate();

  useQueryParamToast({
    created: "Commission program created.",
    updated: "Commission program updated.",
  });

  return (
    <AppPage heading="Commission Programs" inlineSize="large">
      <div className="commission-page">
        <div className="commission-header">
          <AppLink className="button-link" to="/app/commission-programs/new">
            <s-button variant="primary">
              <span className="button-content">
                <Plus aria-hidden="true" size={14} />
                Create Program
              </span>
            </s-button>
          </AppLink>
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
            <AppLink className="button-link" to="/app/commission-programs/new">
              <s-button variant="primary">
                <span className="button-content">
                  <Plus aria-hidden="true" size={13} />
                  Create Program
                </span>
              </s-button>
            </AppLink>
          </section>
        ) : (
          <section className="programs-card">
            <div className="programs-table-header">
              <span>
                <ToggleRight size={15} />
                Status
              </span>
              <span>
                <Users size={15} />
                Program Name
              </span>
              <span>
                <Type size={15} />
                Commission Type
              </span>
              <span>
                <Tag size={15} />
                Products
              </span>
              <span>
                <User size={15} />
                Staff
              </span>
            </div>

            {programs.map((program) => {
              const productCount =
                program.productScope === "all"
                  ? null
                  : parseJsonArray(program.productCommissions).length;
              const staffCount = parseIds(program.employeeIds).length;
              const typeLabel =
                program.commissionType === "percentage" ? "Percentage" : "Fixed";
              const pending =
                fetcher.state !== "idle" &&
                String(fetcher.formData?.get("id") || "") === program.id;

              return (
                <div
                  className="programs-table-row is-clickable"
                  key={program.id}
                  role="link"
                  tabIndex={0}
                  onClick={() => navigate(`/app/commission-programs/${program.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      navigate(`/app/commission-programs/${program.id}`);
                    }
                  }}
                >
                  <div
                    className="status-cell"
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <fetcher.Form method="post">
                      <input type="hidden" name="intent" value="toggleActive" />
                      <input type="hidden" name="id" value={program.id} />
                      <input
                        type="hidden"
                        name="active"
                        value={program.active ? "false" : "true"}
                      />
                      <button
                        type="submit"
                        className={`status-toggle${program.active ? " is-active" : ""}`}
                        disabled={pending}
                        aria-label={
                          program.active ? "Deactivate program" : "Activate program"
                        }
                      >
                        <span />
                      </button>
                    </fetcher.Form>
                  </div>

                  <div className="program-name">{program.name}</div>

                  <div>
                    <span className="type-pill">{typeLabel}</span>
                  </div>

                  <div>
                    {productCount == null
                      ? "All Products"
                      : `${productCount} Product${productCount === 1 ? "" : "s"}`}
                  </div>

                  <div>
                    {staffCount} Staff
                  </div>
                </div>
              );
            })}
          </section>
        )}
      </div>

      <style>{COMMISSION_STYLES}</style>
    </AppPage>
  );
}

export function ErrorBoundary() {
  return <AppErrorBoundary />;
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

  .programs-card {
    overflow: hidden;
  }

  .programs-table-header,
  .programs-table-row {
    align-items: center;
    display: grid;
    gap: 12px;
    grid-template-columns: 100px minmax(160px, 1.4fr) 150px 130px 110px;
    padding: 14px 16px;
  }

  .programs-table-row.is-clickable {
    cursor: pointer;
  }

  .programs-table-row.is-clickable:hover {
    background: #fafafa;
  }

  .status-cell {
    display: inline-flex;
  }

  .programs-table-header {
    background: #f6f6f7;
    border-bottom: 1px solid #ececec;
    color: #202223;
    font-size: 13px;
    font-weight: 600;
  }

  .programs-table-header span {
    align-items: center;
    display: inline-flex;
    gap: 6px;
  }

  .programs-table-row {
    border-bottom: 1px solid #ececec;
    color: #202223;
  }

  .programs-table-row:last-child {
    border-bottom: 0;
  }

  .program-name {
    font-weight: 650;
  }

  .type-pill {
    background: #e0f0ff;
    border-radius: 999px;
    color: #00527c;
    display: inline-flex;
    font-size: 12px;
    font-weight: 600;
    padding: 2px 10px;
  }

  .status-toggle {
    align-items: center;
    background: #8c9196;
    border: none;
    border-radius: 999px;
    cursor: pointer;
    display: inline-flex;
    height: 24px;
    justify-content: flex-start;
    padding: 2px;
    transition: background 120ms ease;
    width: 44px;
  }

  .status-toggle.is-active {
    background: #008060;
    justify-content: flex-end;
  }

  .status-toggle:disabled {
    cursor: wait;
  }

  .status-toggle span {
    background: #fff;
    border-radius: 50%;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
    display: block;
    height: 20px;
    width: 20px;
  }
`;
