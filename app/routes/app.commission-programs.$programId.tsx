import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { redirect, useActionData, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import CommissionProgramForm from "../components/commission-programs/CommissionProgramForm";
import {
  hydrateCommissionProducts,
  parseEmployeeIdsJson,
  parseProductCommissionsJson,
} from "../components/commission-programs/hydrateCommissionProducts.server";
import { parseCommissionProgramForm } from "../components/commission-programs/parseCommissionProgramForm";
import { authenticate } from "../shopify.server";
import { getAdminShop } from "../services/admin.server";
import prisma from "../db.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = await getAdminShop(session);
  const programId = params.programId;
  if (!programId) throw new Response("Program not found", { status: 404 });

  const program = await prisma.commissionProgram.findFirst({
    where: { id: programId, shopId: shop.id },
  });
  if (!program) throw new Response("Program not found", { status: 404 });

  const employees = await prisma.employee.findMany({
    where: { shopId: shop.id, status: { not: "ARCHIVED" } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  const productCommissions = parseProductCommissionsJson(program.productCommissions);
  const products =
    program.productScope === "specific"
      ? await hydrateCommissionProducts(admin, productCommissions)
      : [];

  return {
    employees: employees.map((employee) => ({
      id: employee.id,
      name: `${employee.firstName} ${employee.lastName}`,
      email: employee.email ?? "No email on file",
    })),
    program: {
      id: program.id,
      name: program.name,
      commissionType: program.commissionType,
      afterDiscount: program.afterDiscount,
      limitedTime: program.limitedTime,
      startDate: program.startDate,
      endDate: program.endDate,
      productScope: program.productScope,
      allProductsCommission: program.allProductsCommission,
      employeeIds: parseEmployeeIdsJson(program.employeeIds),
      products,
    },
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getAdminShop(session);
  const programId = params.programId;
  if (!programId) return { error: "Program not found." };

  const existing = await prisma.commissionProgram.findFirst({
    where: { id: programId, shopId: shop.id },
    select: { id: true },
  });
  if (!existing) return { error: "Program not found." };

  const formData = await request.formData();
  const parsed = parseCommissionProgramForm(formData);

  if ("error" in parsed) {
    return {
      error: parsed.error,
      staffError: parsed.staffError,
    };
  }

  try {
    await prisma.commissionProgram.update({
      where: { id: programId },
      data: {
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
      },
    });

    return redirect("/app/commission-programs?updated=1");
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Could not update commission program.",
    };
  }
};

export default function EditCommissionProgram() {
  const { employees, program } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <CommissionProgramForm
      mode="edit"
      employees={employees}
      initialProgram={program}
      actionError={actionData && "error" in actionData ? actionData.error : null}
      staffErrorFromAction={
        actionData && "staffError" in actionData ? actionData.staffError : null
      }
    />
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
