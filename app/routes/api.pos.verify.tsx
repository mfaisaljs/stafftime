import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  buildEmployeeStatus,
  findEmployeeByPin,
  findEmployeeByQr,
} from "../services/workforce.server";
import { errorResponse, jsonResponse } from "../utils/http.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { sessionToken, cors } = await authenticate.pos(request);
  const body = await request.json();
  const { pin, qrCode } = body as { pin?: string; qrCode?: string };

  const employee = pin
    ? await findEmployeeByPin(sessionToken.dest, pin)
    : qrCode
      ? await findEmployeeByQr(sessionToken.dest, qrCode)
      : null;

  if (!employee) {
    return cors(errorResponse("Invalid PIN or QR code", 401));
  }

  const status = await buildEmployeeStatus(employee.id);
  status.employeeName = `${employee.firstName} ${employee.lastName}`;

  return cors(
    jsonResponse({
      employee: {
        id: employee.id,
        firstName: employee.firstName,
        lastName: employee.lastName,
      },
      status,
    }),
  );
};
