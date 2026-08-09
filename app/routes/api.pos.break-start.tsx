import type { ActionFunctionArgs } from "react-router";
import { handlePosClockAction } from "../utils/pos-api.server";

export const action = async ({ request }: ActionFunctionArgs) =>
  handlePosClockAction(request, "break-start");
