import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { redirect, useActionData, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getAdminShop, getEmployees } from "../services/admin.server";
import { TimeOffPolicyForm } from "../components/time-off/TimeOffPolicyForm";
import { parseTimeOffPolicyForm } from "../components/time-off/parseTimeOffPolicyForm";
import prisma from "../db.server";

function parseIds(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getAdminShop(session);
  const policyId = params.policyId;
  if (!policyId) throw new Response("Policy not found", { status: 404 });

  const [employees, policy] = await Promise.all([
    getEmployees(session),
    prisma.timeOffPolicy.findFirst({
      where: { id: policyId, shopId: shop.id },
    }),
  ]);

  if (!policy) throw new Response("Policy not found", { status: 404 });

  return {
    employees: employees
      .filter((employee) => employee.status !== "ARCHIVED")
      .map((employee) => ({
        id: employee.id,
        name: `${employee.firstName} ${employee.lastName}`.trim(),
        position: employee.position ?? roleLabel(employee.role),
      })),
    policy: {
      id: policy.id,
      name: policy.name,
      policyType: policy.policyType,
      compensation: policy.compensation,
      fullDayDuration: policy.fullDayDuration,
      employeeIds: parseIds(policy.employeeIds),
      active: policy.active,
    },
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getAdminShop(session);
  const policyId = params.policyId;
  if (!policyId) return { error: "Policy not found." };

  const existing = await prisma.timeOffPolicy.findFirst({
    where: { id: policyId, shopId: shop.id },
    select: { id: true },
  });
  if (!existing) return { error: "Policy not found." };

  const formData = await request.formData();
  const parsed = parseTimeOffPolicyForm(formData, { allowActive: true });

  if ("error" in parsed) {
    return { error: parsed.error };
  }

  await prisma.timeOffPolicy.update({
    where: { id: policyId },
    data: {
      name: parsed.name,
      policyType: parsed.policyType,
      compensation: parsed.compensation,
      fullDayDuration: parsed.fullDayDuration,
      employeeIds: JSON.stringify(parsed.employeeIds),
      active: parsed.active,
    },
  });

  return redirect("/app/time-off/policy?updated=1");
};

export default function EditTimeOffPolicyPage() {
  const { employees, policy } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <TimeOffPolicyForm
      mode="edit"
      employees={employees}
      initialPolicy={policy}
      actionError={actionData && "error" in actionData ? actionData.error : null}
    />
  );
}

function roleLabel(role: string) {
  switch (role) {
    case "OWNER":
      return "Owner";
    case "REGIONAL_MANAGER":
    case "STORE_MANAGER":
      return "Manager";
    case "SUPERVISOR":
      return "Supervisor";
    default:
      return "Staff";
  }
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
