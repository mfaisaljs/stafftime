import type { HTMLAttributes, ReactNode } from "react";
import { useLocation } from "react-router";
import { AppBackLink } from "./AppBackLink";
import { appPageHeading } from "../utils/app-title";
import { resolveAppBackPath } from "../utils/app-back-path";

export function AppPage({
  heading,
  inlineSize,
  backTo,
  showBack,
  children,
  ...props
}: {
  heading?: string;
  inlineSize?: "small" | "base" | "large";
  backTo?: string;
  showBack?: boolean;
  children?: ReactNode;
} & HTMLAttributes<HTMLElement>) {
  const location = useLocation();
  const resolvedBack =
    showBack === false ? null : (backTo ?? resolveAppBackPath(location.pathname));

  return (
    <s-page
      {...props}
      heading={heading ? appPageHeading(heading) : undefined}
      inlineSize={inlineSize}
    >
      {resolvedBack ? <AppBackLink to={resolvedBack} /> : null}
      {children}
    </s-page>
  );
}
