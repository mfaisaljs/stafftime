import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { Tag, Type, User, Users, ToggleRight } from "lucide-react";
import { authenticate } from "../shopify.server";
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
  const fetcher = useFetcher();

  return (
    <s-page heading="Commission Programs">
      <Link to="/app/commission-programs/new" style={{ textDecoration: "none" }}>
        <s-button slot="primary-action" variant="primary">
          Create Commission Program
        </s-button>
      </Link>

      {programs.length === 0 ? (
        <s-section>
          <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
            <div style={{ display: "grid", gap: 8 }}>
              <s-heading>No commission programs yet</s-heading>
              <s-paragraph color="subdued">
                Create your first program to start tracking product-based commissions for staff.
              </s-paragraph>
              <div>
                <Link to="/app/commission-programs/new" style={{ textDecoration: "none" }}>
                  <s-button variant="primary">Create Commission Program</s-button>
                </Link>
              </div>
            </div>
          </s-box>
        </s-section>
      ) : (
        <s-section padding="none">
          <s-box padding="none" borderWidth="base" borderRadius="base" background="base" overflow="hidden">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "100px minmax(160px, 1.4fr) 150px 130px 110px",
                gap: 12,
                alignItems: "center",
                padding: "12px 16px",
                background: "var(--p-color-bg-surface-secondary)",
                borderBottom: "1px solid var(--p-color-border)",
                fontSize: 13,
                fontWeight: 600,
                color: "var(--p-color-text)",
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <ToggleRight size={15} />
                Status
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Users size={15} />
                Program Name
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Type size={15} />
                Commission Type
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Tag size={15} />
                Products
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
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
                  key={program.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "100px minmax(160px, 1.4fr) 150px 130px 110px",
                    gap: 12,
                    alignItems: "center",
                    padding: "14px 16px",
                    borderBottom: "1px solid var(--p-color-border)",
                    background: "var(--p-color-bg-surface)",
                  }}
                >
                  <div>
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
                        disabled={pending}
                        aria-label={program.active ? "Deactivate program" : "Activate program"}
                        style={{
                          width: 44,
                          height: 24,
                          borderRadius: 999,
                          border: "none",
                          padding: 2,
                          cursor: pending ? "wait" : "pointer",
                          background: program.active ? "#008060" : "#8c9196",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: program.active ? "flex-end" : "flex-start",
                          transition: "background 120ms ease",
                        }}
                      >
                        <span
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: "50%",
                            background: "#fff",
                            boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
                          }}
                        />
                      </button>
                    </fetcher.Form>
                  </div>

                  <div style={{ fontWeight: 650, color: "var(--p-color-text)" }}>
                    {program.name}
                  </div>

                  <div>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "2px 10px",
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 600,
                        background: "#e0f0ff",
                        color: "#00527c",
                      }}
                    >
                      {typeLabel}
                    </span>
                  </div>

                  <div style={{ color: "var(--p-color-text)" }}>
                    {productCount == null
                      ? "All Products"
                      : `${productCount} Product${productCount === 1 ? "" : "s"}`}
                  </div>

                  <div style={{ color: "var(--p-color-text)" }}>
                    {staffCount} Staff
                  </div>
                </div>
              );
            })}
          </s-box>
        </s-section>
      )}

      <s-section>
        <s-paragraph color="subdued">
          For more guidance, visit our Knowledge Base
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
