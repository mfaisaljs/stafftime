import { useEffect, useRef } from "react";
import { useNavigation } from "react-router";
import { showAdminToast } from "../utils/admin-toast";

export type SaveBarFeedback = {
  success?: string;
  error?: string;
} | null | undefined;

export function useSaveBarToast(feedback: SaveBarFeedback) {
  const navigation = useNavigation();
  const previousNavigationState = useRef(navigation.state);
  const lastToastedRef = useRef<string | null>(null);
  const success = feedback?.success;
  const error = feedback?.error;

  useEffect(() => {
    if (navigation.state === "submitting") {
      lastToastedRef.current = null;
    }
  }, [navigation.state]);

  useEffect(() => {
    const wasSubmitting = previousNavigationState.current === "submitting";
    previousNavigationState.current = navigation.state;

    if (!wasSubmitting || navigation.state !== "idle") {
      return;
    }

    const message = success ?? error;
    if (!message) {
      return;
    }

    const toastKey = `${success ? "success" : "error"}:${message}`;
    if (lastToastedRef.current === toastKey) {
      return;
    }

    lastToastedRef.current = toastKey;
    showAdminToast(message, { isError: Boolean(error) });
  }, [success, error, navigation.state]);
}
