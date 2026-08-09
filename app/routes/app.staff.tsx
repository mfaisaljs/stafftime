import type { ActionFunctionArgs, HeadersFunction } from "react-router";
import { Outlet } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getAdminShop } from "../services/admin.server";
import {
  bulkArchiveEmployees,
  bulkDeleteEmployees,
} from "../services/workforce.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getAdminShop(session);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const employeeIds = formData
    .getAll("employeeIds")
    .map((value) => String(value))
    .filter(Boolean);

  if (employeeIds.length === 0) {
    return { error: "Select at least one staff member" };
  }

  try {
    if (intent === "archive") {
      const { count } = await bulkArchiveEmployees(shop.id, employeeIds);
      return { success: `Archived ${count} staff member(s)` };
    }

    if (intent === "delete") {
      const { count } = await bulkDeleteEmployees(shop.id, employeeIds);
      return { success: `Deleted ${count} staff member(s)` };
    }

    return { error: "Unknown action" };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Could not update staff selection",
    };
  }
};

export default function StaffLayout() {
  return <Outlet />;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
