import type { HTMLAttributes, ReactNode } from "react";
import { useLocation } from "react-router";
import { AppLink } from "./AppLink";
import { APP_PAGE_STYLES } from "./app-page-styles";
import { APP_DISPLAY_NAME } from "../utils/app-title";
import { resolveAppBackPath } from "../utils/app-back-path";

export function AppPage({
  heading,
  subtitle,
  inlineSize,
  backTo,
  backLabel = "Back",
  showBack,
  children,
  ...props
}: {
  heading?: string;
  subtitle?: string;
  inlineSize?: "small" | "base" | "large";
  backTo?: string;
  backLabel?: string;
  showBack?: boolean;
  children?: ReactNode;
} & HTMLAttributes<HTMLElement>) {
  const location = useLocation();
  const resolvedBack =
    showBack === false ? null : (backTo ?? resolveAppBackPath(location.pathname));

  return (
    <s-page {...props} heading={APP_DISPLAY_NAME} inlineSize={inlineSize}>
      <style>{APP_PAGE_STYLES}</style>
      {heading ? (
        <div className="app-page-subheader">
          <div className="app-page-subheader__heading">
            <h2 className="app-page-subheader__title">{heading.toUpperCase()}</h2>
            {subtitle ? (
              <p className="app-page-subheader__subtitle">{subtitle}</p>
            ) : null}
          </div>
          {resolvedBack ? (
            <AppLink to={resolvedBack} className="app-page-subheader__back">
              ← {backLabel}
            </AppLink>
          ) : null}
        </div>
      ) : null}
      {children}
    </s-page>
  );
}
