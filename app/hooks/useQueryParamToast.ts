import { useEffect } from "react";
import { useSearchParams } from "react-router";
import { showAdminToast } from "../utils/admin-toast";

export function useQueryParamToast(messages: Record<string, string>) {
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    let changed = false;
    const next = new URLSearchParams(searchParams);

    for (const [param, message] of Object.entries(messages)) {
      if (searchParams.get(param) !== "1") continue;
      showAdminToast(message);
      next.delete(param);
      changed = true;
    }

    if (changed) {
      setSearchParams(next, { replace: true });
    }
  }, [messages, searchParams, setSearchParams]);
}
