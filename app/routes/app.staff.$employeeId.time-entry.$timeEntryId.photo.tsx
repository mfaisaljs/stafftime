import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { getAdminShop, getEmployeeById } from "../services/admin.server";
import { clockPhotoResponse } from "../services/clock-photo.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const employeeId = params.employeeId;
  const timeEntryId = params.timeEntryId;
  if (!employeeId || !timeEntryId) {
    throw new Response("Not found", { status: 404 });
  }

  const employee = await getEmployeeById(session, employeeId);
  if (!employee) {
    throw new Response("Not found", { status: 404 });
  }

  const shop = await getAdminShop(session);
  const kind = new URL(request.url).searchParams.get("kind") === "out" ? "out" : "in";

  const entry = await prisma.timeEntry.findFirst({
    where: { id: timeEntryId, employeeId, shopId: shop.id },
    select: { photoUrl: true, clockOutPhotoUrl: true },
  });
  if (!entry) {
    throw new Response("Not found", { status: 404 });
  }

  const dataUrl = kind === "out" ? entry.clockOutPhotoUrl : entry.photoUrl;
  if (!dataUrl) {
    throw new Response("Photo not found", { status: 404 });
  }

  return clockPhotoResponse(dataUrl);
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
