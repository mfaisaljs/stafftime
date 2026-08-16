import { useEffect, useRef } from "react";
import { useNavigation } from "react-router";
import { showAdminToast } from "../utils/admin-toast";

export type SaveBarFeedback = {
  success?: string;
  error?: string;
} | null | undefined;

type SaveBarToastState = "idle" | "submitting" | "loading";

export function useSaveBarToast(
  feedback: SaveBarFeedback,
  options?: { state?: SaveBarToastState },
) {
  const navigation = useNavigation();
  const state = options?.state ?? navigation.state;
  const previousState = useRef<SaveBarToastState>(state);
  const success = feedback?.success;
  const error = feedback?.error;

  useEffect(() => {
    const wasInFlight =
      previousState.current === "submitting" ||
      previousState.current === "loading";
    const isIdle = state === "idle";
    previousState.current = state;

    if (!wasInFlight || !isIdle) {
      return;
    }

    const message = success ?? error;
    if (!message) {
      return;
    }

    showAdminToast(message, { isError: Boolean(error) });
  }, [state, success, error]);
}
