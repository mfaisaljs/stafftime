import { useCallback } from "react";
import { useNavigate, type NavigateOptions, type To } from "react-router";
import { useAppPath } from "./useAppPath";

export function useAppNavigate() {
  const navigate = useNavigate();
  const appPath = useAppPath();

  return useCallback(
    (to: To | number, options?: NavigateOptions) => {
      if (typeof to === "number") {
        navigate(to);
        return;
      }

      if (typeof to === "string" && to.startsWith("/app")) {
        navigate(appPath(to), options);
        return;
      }

      navigate(to, options);
    },
    [appPath, navigate],
  );
}
