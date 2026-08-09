import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  activateEmployeeOnFirstLogin,
  buildEmployeeStatus,
  ensureShop,
  findEmployeeByPin,
  findEmployeeByQr,
  seedDemoDataForShop,
} from "../services/workforce.server";
import {
  errorResponse,
  jsonResponse,
  posPreflightResponse,
} from "../utils/http.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") return posPreflightResponse();
  return errorResponse("Method not allowed", 405);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { sessionToken, cors } = await authenticate.pos(request);
  const body = await request.json();
  const { pin, qrCode } = body as { pin?: string; qrCode?: string };
  const shop = await ensureShop(sessionToken.dest);

  await seedDemoDataForShop(shop.id);

  try {
    const employee = pin
      ? await findEmployeeByPin(shop.domain, pin)
      : qrCode
        ? await findEmployeeByQr(shop.domain, qrCode)
        : null;

    if (!employee) {
      return cors(errorResponse("Invalid PIN or QR code", 401));
    }

    const activatedEmployee = await activateEmployeeOnFirstLogin(employee.id);
    const status = await buildEmployeeStatus(activatedEmployee.id);
    status.employeeName = `${activatedEmployee.firstName} ${activatedEmployee.lastName}`;

    return cors(
      jsonResponse({
        employee: {
          id: activatedEmployee.id,
          firstName: activatedEmployee.firstName,
          lastName: activatedEmployee.lastName,
        },
        status,
        serverTime: Date.now(),
      }),
    );
  } catch (error) {
    return cors(
      errorResponse(
        error instanceof Error ? error.message : "Verification failed",
        409,
      ),
    );
  }
};
