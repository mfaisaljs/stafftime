import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router";
import { showAdminToast } from "../utils/admin-toast";

export function useQueryParamToast(messages: Record<string, string>) {
  const [searchParams, setSearchParams] = useSearchParams();
  const messagesRef = useRef(messages);
  const toastedRef = useRef(new Set<string>());

  messagesRef.current = messages;

  useEffect(() => {
    const paramsKey = searchParams.toString();
    let changed = false;
    const next = new URLSearchParams(searchParams);

    for (const [param, message] of Object.entries(messagesRef.current)) {
      if (searchParams.get(param) !== "1") continue;

      const toastKey = `${param}|${paramsKey}`;
      if (toastedRef.current.has(toastKey)) continue;

      toastedRef.current.add(toastKey);
      showAdminToast(message);
      next.delete(param);
      changed = true;
    }

    if (changed) {
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);
}
