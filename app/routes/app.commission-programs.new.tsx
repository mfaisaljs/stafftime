import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { redirect, useActionData, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppErrorBoundary } from "../components/AppErrorBoundary";
import CommissionProgramForm from "../components/commission-programs/CommissionProgramForm";
import { parseCommissionProgramForm } from "../components/commission-programs/parseCommissionProgramForm";
import { authenticate } from "../shopify.server";
import { getAdminShop } from "../services/admin.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getAdminShop(session);
  const employees = await prisma.employee.findMany({
    where: { shopId: shop.id, status: { not: "ARCHIVED" } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  return {
    employees: employees.map((employee) => ({
      id: employee.id,
      name: `${employee.firstName} ${employee.lastName}`,
      email: employee.email ?? "No email on file",
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getAdminShop(session);
  const formData = await request.formData();
  const parsed = parseCommissionProgramForm(formData);

  if ("error" in parsed) {
    return {
      error: parsed.error,
      staffError: parsed.staffError,
    };
  }

  try {
    await prisma.commissionProgram.create({
      data: {
        shopId: shop.id,
        name: parsed.name,
        commissionType: parsed.commissionType,
        afterDiscount: parsed.afterDiscount,
        limitedTime: parsed.limitedTime,
        startDate: parsed.startDate,
        endDate: parsed.endDate,
        productScope: parsed.productScope,
        allProductsCommission: parsed.allProductsCommission,
        productCommissions: JSON.stringify(parsed.productCommissions),
        employeeIds: JSON.stringify(parsed.employeeIds),
        active: true,
      },
    });

    return redirect("/app/commission-programs?created=1");
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Could not create commission program.",
    };
  }
};

export default function CreateCommissionProgram() {
  const { employees } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <CommissionProgramForm
      mode="create"
      employees={employees}
      actionError={actionData && "error" in actionData ? actionData.error : null}
      staffErrorFromAction={
        actionData && "staffError" in actionData ? actionData.staffError : null
      }
    />
  );
}

export function ErrorBoundary() {
  return <AppErrorBoundary />;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
