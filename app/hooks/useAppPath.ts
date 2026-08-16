import { useCallback } from "react";
import { useSearchParams } from "react-router";
import { mergeAppSearchParams } from "../utils/app-path";

export function useAppPath() {
  const [searchParams] = useSearchParams();

  return useCallback(
    (path: string) => mergeAppSearchParams(path, searchParams),
    [searchParams],
  );
}
