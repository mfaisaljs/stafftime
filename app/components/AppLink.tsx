import type { LinkProps } from "react-router";
import { Link } from "react-router";
import { useAppPath } from "../hooks/useAppPath";

export function AppLink({ to, ...props }: LinkProps) {
  const appPath = useAppPath();
  const resolvedTo = typeof to === "string" ? appPath(to) : to;

  return <Link to={resolvedTo} {...props} />;
}
