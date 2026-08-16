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

  useEffect(() => {
    const wasSubmitting = previousNavigationState.current === "submitting";
    previousNavigationState.current = navigation.state;

    if (!wasSubmitting || navigation.state !== "idle" || !feedback) {
      return;
    }

    if (feedback.success) {
      showAdminToast(feedback.success);
      return;
    }

    if (feedback.error) {
      showAdminToast(feedback.error, { isError: true });
    }
  }, [feedback, navigation.state]);
}
