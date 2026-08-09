import type { ActionFunctionArgs, HeadersFunction } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { getAdminShop, getPayrollEntries } from "../services/admin.server";
import { buildPayrollCsv } from "../services/payroll-export.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getAdminShop(session);
  const entries = await getPayrollEntries(session, 30);
  const settings = shop.settings ?? { overtimeDailyHours: 8 };
  const csv = buildPayrollCsv(entries, settings);

  await prisma.payrollExport.create({
    data: {
      shopId: shop.id,
      format: "CSV",
      periodStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      periodEnd: new Date(),
    },
  });

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="stafftime-payroll.csv"',
    },
  });
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
