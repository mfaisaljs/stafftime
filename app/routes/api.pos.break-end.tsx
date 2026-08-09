import type { ActionFunctionArgs } from "react-router";
import {
  handlePosClockAction,
  handlePosPreflight,
} from "../utils/pos-api.server";

export const action = async ({ request }: ActionFunctionArgs) =>
  handlePosClockAction(request, "break-end");

export const loader = handlePosPreflight;
